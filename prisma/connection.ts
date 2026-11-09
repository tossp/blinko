import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseIntoClientConfig } from 'pg-connection-string';

function integerParameter(url: URL, name: string, fallback: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  const value = url.searchParams.get(name);
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`Invalid DATABASE_URL parameter: ${name}`);
  }
  return Number(value);
}

export function createPrismaAdapter(connectionString = process.env.DATABASE_URL): PrismaPg {
  if (!connectionString) throw new Error('DATABASE_URL is required');
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('DATABASE_URL must be a PostgreSQL URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('DATABASE_URL must use postgres:// or postgresql://');
  }

  if (url.searchParams.get('channel_binding') === 'require') {
    throw new Error('channel_binding=require needs an authentication configuration that guarantees channel binding; pg enableChannelBinding only prefers it');
  }

  // pg shares one connect/acquire timeout: pool_timeout > connect_timeout > 5s,
  // with 0 disabling both. This does not preserve two independent Rust limits.
  const maxTimerSeconds = Math.floor(2_147_483_647 / 1_000);
  const connectTimeout = integerParameter(url, 'connect_timeout', 5, 0, maxTimerSeconds);
  const acquireTimeout = integerParameter(url, 'pool_timeout', connectTimeout, 0, maxTimerSeconds);
  const schema = url.searchParams.get('schema') ?? 'public';
  if (!schema) throw new Error('DATABASE_URL schema must not be empty');
  // The adapter qualifies ORM queries, but raw SQL (including legacy seed
  // sequences) also needs the same search_path. Escape both SQL identifiers
  // and PostgreSQL startup-options whitespace/backslashes.
  const searchPath = `"${schema.replaceAll('"', '""')}"`.replace(/[\\\s]/g, '\\$&');
  const options = url.searchParams.get('options');
  url.searchParams.set('options', `${options ? `${options} ` : ''}-c search_path=${searchPath}`);

  const schemaDirectory = resolve(typeof __dirname === 'string' ? __dirname : import.meta.dirname, '../prisma');
  const tlsDisabled = url.searchParams.get('sslmode') === 'disable';
  const ca = url.searchParams.get('sslcert');
  const identity = url.searchParams.get('sslidentity');
  const passphrase = url.searchParams.get('sslpassword');
  const sslAccept = url.searchParams.get('sslaccept');
  // Legacy sslcert is a CA, not pg's client certificate. Resolve legacy files
  // relative to schema.prisma, including when this module is bundled in dist/.
  for (const name of ['sslcert', 'sslidentity', 'sslpassword', 'sslaccept']) url.searchParams.delete(name);
  if (ca && !tlsDisabled) url.searchParams.set('sslrootcert', resolve(schemaDirectory, ca));

  // Parse once through pg's public API: retaining connectionString would let pg
  // parse it again and replace the TLS object (including PFX and strictness).
  const config = parseIntoClientConfig(url.toString());
  if (!tlsDisabled && (sslAccept !== null || identity)) {
    config.ssl = { ...(typeof config.ssl === 'object' ? config.ssl : {}) };
    if (sslAccept !== null) config.ssl.rejectUnauthorized = sslAccept !== 'accept_invalid_certs';
    if (identity) {
      config.ssl.pfx = readFileSync(resolve(schemaDirectory, identity));
      if (passphrase !== null) config.ssl.passphrase = passphrase;
    }
  }
  if (url.searchParams.has('channel_binding')) {
    config.enableChannelBinding = url.searchParams.get('channel_binding') !== 'disable';
  }
  if (url.searchParams.has('socket_timeout')) {
    // Client-side waiting deadline; this is not PostgreSQL statement_timeout.
    config.query_timeout = integerParameter(url, 'socket_timeout', 0, 0, maxTimerSeconds) * 1_000;
  }

  return new PrismaPg({
    ...config,
    // Explicit v7 pool size: 10 rather than the old CPU-dependent default.
    // Existing connection_limit remains authoritative for constrained databases.
    max: integerParameter(url, 'connection_limit', 10, 1),
    connectionTimeoutMillis: acquireTimeout * 1_000,
    idleTimeoutMillis: integerParameter(url, 'max_idle_connection_lifetime', 300, 0, maxTimerSeconds) * 1_000,
    maxLifetimeSeconds: integerParameter(url, 'max_connection_lifetime', 0, 0, maxTimerSeconds),
  }, {
    schema,
  });
}
