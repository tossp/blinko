import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from 'bun:test';

// Optional SQL mode must run in its own process with a dedicated, disposable DB.
const sql = process.env.BLINKO_OAUTH_PG_TEST === '1';
if (sql) {
  const url = new URL(process.env.DATABASE_URL!);
  if (process.env.NODE_ENV !== 'test' || !process.env.BLINKO_OAUTH_PG_HOST
    || url.hostname !== process.env.BLINKO_OAUTH_PG_HOST || url.pathname !== '/oauth') {
    throw new Error('OAuth SQL tests require the explicitly identified, isolated oauth database');
  }
}

let accounts: any[] = [];
let configs: any[] = [];
let tokens: any[] = [];
let unavailable = false;
const providers = [{ id: 'github', clientId: 'fixture-id', clientSecret: 'fixture-secret' }];
const memory = {
  accounts: {
    count: async () => accounts.length,
    findFirst: async ({ where }: any) => accounts.find(row =>
      Object.entries(where).every(([key, value]) => row[key] === value)) ?? null,
    create: async ({ data }: any) => {
      const row = { id: accounts.length + 1, apiToken: '', image: '', ...data };
      accounts.push(row);
      return { ...row };
    },
    update: async ({ where, data }: any) => {
      const row = accounts.find(row => row.id === where.id)!;
      Object.assign(row, data);
      return { ...row };
    },
  },
  config: {
    findFirst: async ({ where }: any) => {
      if (unavailable) throw new Error('Fixture config unavailable');
      return configs.find(row => row.key === where.key) ?? null;
    },
    create: async ({ data }: any) => {
      const row = { id: configs.length + 1, ...data };
      configs.push(row);
      return row;
    },
  },
};
if (!sql) {
  mock.module('../../prisma', () => ({ prisma: memory }));
  mock.module('../../routerTrpc/config', () => ({
    getGlobalConfig: async ({ ctx }: any) => ({
      oauth2Providers: providers,
      twoFactorEnabled: configs.some(row => row.key === 'twoFactorEnabled'
        && row.userId === Number(ctx?.id) && row.config.value === true),
    }),
  }));
}
mock.module('../../lib/helper', () => ({
  generateTOTP: () => { throw new Error('Unexpected TOTP creation'); },
  generateTOTPQRCode: () => { throw new Error('Unexpected QR creation'); },
  verifyTOTP: () => { throw new Error('Unexpected TOTP verification'); },
  getNextAuthSecret: async () => { throw new Error('Unexpected secret access'); },
  generateToken: async (user: any, verified: boolean) => {
    tokens.push({ kind: 'login', id: user.id, verified });
    return `FIXTURE_LOGIN_${user.id}`;
  },
  generateApiToken: async (user: any) => {
    tokens.push({ kind: 'api', id: user.id });
    return `FIXTURE_API_${user.id}`;
  },
}));
mock.module('../../../prisma/seed', () => ({
  hashPassword: async (password: string) => `FIXTURE_HASH_${password}`,
  verifyPassword: async () => { throw new Error('Unexpected password verification'); },
}));
mock.module('../../../shared/lib/cache', () => ({
  cache: { set() {}, wrap: async (_key: string, read: () => Promise<any>) => read() },
}));

if (sql) {
  // Password-policy controls use the real resolver/SQL, not seed data or notes.
  mock.module('../../../prisma/seedData', () => ({ createSeed: async () => {} }));
  mock.module('../../routerTrpc/note', () => ({ deleteNotes: async () => { throw new Error('Unexpected note deletion'); } }));
}
const { prisma } = await import('../../prisma');
const passwordCaller = sql ? (await import('../../routerTrpc/user')).userRouter.createCaller({} as any) : null;
const { default: passport, ensureOAuthStrategies } = await import('../../routerExpress/auth/config');
let callback: (...args: any[]) => Promise<any>;
let owner: any;
const invoke = async (name: string) => {
  let calls = 0;
  let result: { error: any; user: any; info: any };
  await callback('LOCAL_ACCESS', 'LOCAL_REFRESH', { id: name, username: name, photos: [] },
    (error: any, user: any, info: any) => { calls++; result = { error, user, info }; });
  expect(calls).toBe(1);
  return result!;
};
const registration = async (value: boolean | null) => {
  if (value !== null) await prisma.config.create({ data: {
    key: 'isAllowRegister', config: { type: 'boolean', value },
  } });
};
const reset = async () => {
  if (sql) await prisma.$executeRawUnsafe('TRUNCATE TABLE "accounts", "config" RESTART IDENTITY CASCADE');
  else { accounts = []; configs = []; }
  tokens = [];
  unavailable = false;
};
beforeAll(async () => {
  if (sql) {
    await prisma.$connect();
    const rows = await prisma.$queryRawUnsafe<Array<{ database: string }>>('SELECT current_database() AS database');
    expect(rows[0]!.database).toBe('oauth');
    expect(await prisma.accounts.count()).toBe(0);
    await prisma.config.create({ data: { key: 'oauth2Providers', config: { value: providers } } });
  }
  await ensureOAuthStrategies('github');
  // Invoke the real callback installed by application strategy initialization;
  // only provider-supplied input and token issuance are local fixtures.
  callback = (passport as any)._strategy('github')._verify;
  expect(typeof callback).toBe('function');
});
beforeEach(async () => {
  await reset();
  owner = await prisma.accounts.create({ data: { name: 'ordinary-owner', role: 'user', loginType: 'local' } });
});
afterAll(async () => {
  if (sql) { await reset(); await prisma.$disconnect(); }
});

describe(`OAuth registration policy (${sql ? 'real PostgreSQL' : 'isolated fixture'})`, () => {
  test.each([false, null] as const)('disabled/missing registration (%s) creates no account or tokens', async value => {
    await registration(value);
    const before = await prisma.accounts.count();
    const result = await invoke('unknown-oauth');
    expect(result).toEqual({ error: null, user: false, info: { message: 'not allow register' } });
    expect(await prisma.accounts.count()).toBe(before);
    expect(await prisma.accounts.findFirst({ where: { name: 'unknown-oauth' } })).toBeNull();
    expect((await prisma.accounts.findFirst({ where: { id: owner.id } }))!.apiToken).toBe('');
    expect(tokens).toEqual([]);
  });
  test('enabled registration creates an ordinary OAuth account and both tokens', async () => {
    await registration(true);
    const before = await prisma.accounts.count();
    const result = await invoke('new-oauth');
    const stored = await prisma.accounts.findFirst({ where: { name: 'new-oauth' } });
    expect(result.error).toBeNull();
    expect(result.user).toMatchObject({ id: stored!.id, role: 'user', loginType: 'oauth', token: `FIXTURE_LOGIN_${stored!.id}` });
    expect(stored!.apiToken).toBe(`FIXTURE_API_${stored!.id}`);
    expect(await prisma.accounts.count()).toBe(before + 1);
    expect(tokens).toEqual([{ kind: 'login', id: stored!.id, verified: false }, { kind: 'api', id: stored!.id }]);
  });
  test.each([false, null] as const)('existing OAuth account logs in when registration is %s', async value => {
    await registration(value);
    const existing = await prisma.accounts.create({ data: { name: 'existing-oauth', role: 'user', loginType: 'oauth' } });
    const before = await prisma.accounts.count();
    const result = await invoke(existing.name);
    expect(result.error).toBeNull();
    expect(result.user.id).toBe(existing.id);
    expect(result.user.token).toBe(`FIXTURE_LOGIN_${existing.id}`);
    expect(await prisma.accounts.count()).toBe(before);
    expect(tokens).toHaveLength(2);
  });
  test.each([false, true] as const)('existing OAuth 2FA account (linked=%s) cannot issue tokens early', async linked => {
    await registration(false);
    const existing = await prisma.accounts.create({ data: {
      name: 'existing-oauth', role: 'user', loginType: 'oauth',
      ...(linked ? { linkAccountId: owner.id } : {}),
    } });
    const target = linked ? owner : existing;
    await prisma.config.create({ data: { key: 'twoFactorEnabled', userId: target.id, config: { type: 'boolean', value: true } } });
    const before = await prisma.accounts.count();
    const result = await invoke(existing.name);
    expect(result).toEqual({ error: null, user: false, info: { requiresTwoFactor: true, userId: target.id } });
    expect(await prisma.accounts.count()).toBe(before);
    expect((await prisma.accounts.findFirst({ where: { id: target.id } }))!.apiToken).toBe('');
    expect(tokens).toEqual([]);
  });
  test('linked existing OAuth account without 2FA still logs into its target', async () => {
    await registration(false);
    await prisma.accounts.create({ data: { name: 'linked-oauth', role: 'user', loginType: 'oauth', linkAccountId: owner.id } });
    const before = await prisma.accounts.count();
    const result = await invoke('linked-oauth');
    expect(result.user.id).toBe(owner.id);
    expect(result.user.token).toBe(`FIXTURE_LOGIN_${owner.id}`);
    expect(await prisma.accounts.count()).toBe(before);
  });
  test.each([false, true, null] as const)('zero-account bootstrap remains allowed with registration=%s', async value => {
    await reset();
    await registration(value);
    expect(await prisma.accounts.count()).toBe(0);
    const result = await invoke('first-oauth');
    expect(result.error).toBeNull();
    // Preserve OAuth's existing role; this repair does not turn it into admin setup.
    expect(result.user.role).toBe('user');
    expect(await prisma.accounts.count()).toBe(1);
    expect(tokens).toHaveLength(2);
    const second = await invoke('second-oauth');
    if (value === true) expect(second.user.role).toBe('user');
    else expect(second.user).toBe(false);
    expect(await prisma.accounts.count()).toBe(value === true ? 2 : 1);
  });
  if (sql) {
    test.each([false, true, null] as const)('real password registration matches the post-bootstrap switch (%s)', async value => {
      await registration(value);
      const attempt = passwordCaller!.register({ name: 'new-password', password: 'local-fixture' });
      if (value === true) await expect(attempt).resolves.toBe(true);
      else await expect(attempt).rejects.toThrow('not allow register');
      expect(await prisma.accounts.count()).toBe(value === true ? 2 : 1);
      expect(await prisma.accounts.findFirst({ where: { id: owner.id } })).toMatchObject({ name: 'ordinary-owner' });
    });
    test.each([false, true, null] as const)('real password registration permits first-account bootstrap (%s)', async value => {
      await reset();
      await registration(value);
      await expect(passwordCaller!.register({ name: 'first-password', password: 'local-fixture' })).resolves.toBe(true);
      expect(await prisma.accounts.count()).toBe(1);
      expect(await prisma.accounts.findFirst({ where: { name: 'first-password' } })).toMatchObject({ role: 'superadmin' });
    });
  }
  if (!sql) test('config read failures cannot create accounts or tokens', async () => {
    unavailable = true;
    const result = await invoke('unknown-oauth');
    expect(result.error.message).toBe('Fixture config unavailable');
    expect(result.user).toBeUndefined();
    expect(await prisma.accounts.count()).toBe(1);
    expect(tokens).toEqual([]);
  });
});
