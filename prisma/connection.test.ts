import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import type { Pool } from 'pg';
import type { ConnectionOptions } from 'node:tls';
import { createPrismaAdapter } from './connection';

const fixtureUrl = 'postgresql://fixture:fixture@127.0.0.1:1/fixture';
let fixtures: string;
let ca: string;
let identity: string;

beforeAll(() => {
  fixtures = mkdtempSync(join(tmpdir(), 'blinko-prisma-connection-'));
  writeFileSync(join(fixtures, 'ca.pem'), 'configuration fixture CA');
  writeFileSync(join(fixtures, 'client.p12'), new Uint8Array([1, 2, 3]));
  ca = relative(import.meta.dirname, join(fixtures, 'ca.pem'));
  identity = relative(import.meta.dirname, join(fixtures, 'client.p12'));
});
afterAll(() => rmSync(fixtures, { recursive: true, force: true }));

async function inspectAdapter(url: string, inspect: (pool: Pool, schema: string | undefined) => void) {
  // connect() creates an idle pg pool; these unit tests open no DB connections.
  const adapter = await createPrismaAdapter(url).connect();
  try {
    const pool = adapter.underlyingDriver() as Pool;
    expect(pool.totalCount).toBe(0);
    inspect(pool, adapter.getConnectionInfo()?.schemaName);
  } finally {
    await adapter.dispose();
  }
}

function withParameters(parameters: Record<string, string>) {
  return `${fixtureUrl}?${new URLSearchParams(parameters)}`;
}

describe('Prisma 7 connection compatibility', () => {
  test('uses explicit bounded pool defaults without introducing a TLS policy', async () => {
    await inspectAdapter(fixtureUrl, (pool, schema) => {
      expect(pool.options.max).toBe(10);
      expect(pool.options.connectionTimeoutMillis).toBe(5_000);
      expect(pool.options.idleTimeoutMillis).toBe(300_000);
      expect(pool.options.maxLifetimeSeconds).toBe(0);
      expect(pool.options.ssl).toBeUndefined();
      expect(schema).toBe('public');
    });
  });

  test('maps legacy pool knobs and preserves schema / existing startup options', async () => {
    await inspectAdapter(`${fixtureUrl}?schema=tenant&connection_limit=3&connect_timeout=7&pool_timeout=7&max_idle_connection_lifetime=60&max_connection_lifetime=120&options=-c%20statement_timeout%3D3000`, (pool, schema) => {
      expect(pool.options.max).toBe(3);
      expect(pool.options.connectionTimeoutMillis).toBe(7_000);
      expect(pool.options.idleTimeoutMillis).toBe(60_000);
      expect(pool.options.maxLifetimeSeconds).toBe(120);
      expect(schema).toBe('tenant');
      expect(pool.options.options).toBe('-c statement_timeout=3000 -c search_path="tenant"');
    });
  });

  test('accepts independent legacy values with the declared shared-timeout precedence', async () => {
    for (const [parameters, timeout] of [
      ['connect_timeout=5&pool_timeout=10', 10_000],
      ['connect_timeout=2', 2_000],
      ['connect_timeout=5&pool_timeout=0', 0],
      ['connect_timeout=0', 0],
    ] as const) {
      await inspectAdapter(`${fixtureUrl}?${parameters}`, pool => {
        expect(pool.options.connectionTimeoutMillis).toBe(timeout);
      });
    }
  });

  test('maps socket_timeout to a client waiting deadline, not a server timeout', async () => {
    await inspectAdapter(`${fixtureUrl}?socket_timeout=3&statement_cache_size=99&pgbouncer=true`, pool => {
      expect(pool.options.query_timeout).toBe(3_000);
      expect(pool.options.statement_timeout).toBeUndefined();
    });
  });

  test('rejects absent/malformed URLs without leaking connection credentials', () => {
    expect(() => createPrismaAdapter('')).toThrow('DATABASE_URL is required');
    expect(() => createPrismaAdapter('secret-password')).toThrow('DATABASE_URL must be a PostgreSQL URL');
    expect(() => createPrismaAdapter('https://fixture:secret@127.0.0.1')).toThrow('DATABASE_URL must use');
  });

  test('rejects malformed numeric settings', () => {
    for (const parameter of ['connection_limit=0', 'pool_timeout=-1', 'connect_timeout=NaN', 'max_idle_connection_lifetime=0.5', 'socket_timeout=-1']) {
      expect(() => createPrismaAdapter(`${fixtureUrl}?${parameter}`)).toThrow('Invalid DATABASE_URL parameter');
    }
  });

  test('treats legacy sslcert as a schema-relative CA and keeps strict verification', async () => {
    await inspectAdapter(withParameters({ sslmode: 'verify-full', sslcert: ca, sslaccept: 'strict' }), pool => {
      const ssl = pool.options.ssl as ConnectionOptions;
      expect(ssl.ca).toBe('configuration fixture CA');
      expect(ssl.cert).toBeUndefined();
      expect(ssl.rejectUnauthorized).toBe(true);
      expect(pool.options.connectionString).toBeUndefined();
    });
  });

  test('only an explicit legacy certificate waiver disables its verification', async () => {
    await inspectAdapter(withParameters({ sslmode: 'verify-full', sslaccept: 'accept_invalid_certs' }), pool => {
      expect((pool.options.ssl as ConnectionOptions).rejectUnauthorized).toBe(false);
    });
    await inspectAdapter(withParameters({ sslmode: 'no-verify', sslaccept: 'strict' }), pool => {
      expect((pool.options.ssl as ConnectionOptions).rejectUnauthorized).toBe(true);
    });
    await inspectAdapter(withParameters({ sslmode: 'verify-full' }), pool => {
      expect((pool.options.ssl as ConnectionOptions).rejectUnauthorized).not.toBe(false);
    });
  });

  test('sslmode=disable takes precedence without reading legacy TLS files', async () => {
    await inspectAdapter(withParameters({ sslmode: 'disable', sslcert: 'not-present.pem', sslidentity: 'not-present.p12', sslpassword: 'fixture', sslaccept: 'accept_invalid_certs' }), pool => {
      expect(pool.options.ssl).toBe(false);
    });
  });

  test('keeps PFX, passphrase, and CA together without URL re-parsing', async () => {
    await inspectAdapter(withParameters({ sslmode: 'verify-full', sslcert: ca, sslidentity: identity, sslpassword: 'fixture', sslaccept: 'strict' }), pool => {
      const ssl = pool.options.ssl as ConnectionOptions;
      expect(ssl.pfx).toEqual(Buffer.from([1, 2, 3]));
      expect(ssl.passphrase).toBe('fixture');
      expect(ssl.ca).toBe('configuration fixture CA');
      expect(ssl.rejectUnauthorized).toBe(true);
    });
  });

  test('maps channel binding preferences but does not promise enforcement', async () => {
    for (const binding of ['disable', 'prefer']) {
      await inspectAdapter(withParameters({ channel_binding: binding }), pool => {
        expect(pool.options.enableChannelBinding).toBe(binding === 'prefer');
      });
    }
    expect(() => createPrismaAdapter(withParameters({ channel_binding: 'require' }))).toThrow('only prefers');
  });
});
