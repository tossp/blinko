import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { createPrismaAdapter } from '../../../prisma/connection';

// Separate Bun process; opt in only with the dedicated disposable DB URL.
// Never use DATABASE_URL as a fallback and never truncate application tables.
const databaseUrl = process.env.BLINKO_AUTHZ_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)('note/tag ownership with real tRPC + Prisma + PostgreSQL', () => {
  let db: PrismaClient;
  let root: any;
  let fixture: any;
  const accountIds: number[] = [];
  const noteIds: number[] = [];
  let sqlQueries = 0;
  let previousPrisma: PrismaClient | undefined;
  const globals = globalThis as typeof globalThis & { prisma?: PrismaClient };
  const context = (account: any, extra = {}) => ({
    id: String(account.id), sub: String(account.id), name: account.name,
    role: account.role, ...extra,
  });
  const caller = (account: any, extra = {}) => root.createCaller(context(account, extra));
  const ids = (rows: any[]) => rows.map(row => row.id).sort((a, b) => a - b);

  beforeAll(async () => {
    // Supplied by the parent agent's isolated PG fixture, not repository .env.
    const url = new URL(databaseUrl!);
    if (url.pathname !== '/authz') throw new Error('Expected dedicated authz database');
    const client = new PrismaClient({
      adapter: createPrismaAdapter(databaseUrl),
      log: [{ emit: 'event', level: 'query' }],
    });
    client.$on('query', () => { sqlQueries++; });
    db = client;
    await db.$connect();
    const identity = await db.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    expect(identity).toEqual([{ database: 'authz' }]);
    previousPrisma = globals.prisma;
    globals.prisma = db;
    // Keep the real routers, middleware, Zod schemas, query helper and Prisma.
    // Unused external boundaries must never contact AI/storage/auth services.
    mock.module('../../routerTrpc/config', () => ({ getGlobalConfig: async () => ({}) }));
    mock.module('../../lib/files', () => ({ FileService: {} }));
    mock.module('../../lib/helper', () => ({ SendWebhook: () => { throw new Error('Unexpected webhook'); } }));
    mock.module('../../aiServer', () => ({ AiService: {} }));
    mock.module('../../aiServer/aiModelFactory', () => ({ AiModelFactory: {} }));
    mock.module('../../routerTrpc/_app', () => ({ userCaller: (ctx: any) => root.createCaller(ctx) }));
    const { router } = await import('../../middleware');
    const { noteRouter } = await import('../../routerTrpc/note');
    const { tagRouter } = await import('../../routerTrpc/tag');
    root = router({ notes: noteRouter, tags: tagRouter });
    const prefix = `ownership-${crypto.randomUUID()}`;
    const a = await db.accounts.create({ data: { name: `${prefix}-A`, role: 'user' } });
    accountIds.push(a.id);
    const b = await db.accounts.create({ data: { name: `${prefix}-B`, role: 'user' } });
    accountIds.push(b.id);
    const admin = await db.accounts.create({ data: { name: `${prefix}-admin`, role: 'superadmin' } });
    accountIds.push(admin.id);
    const makeNote = async (name: string, accountId = a.id, extra = {}) => {
      const note = await db.notes.create({ data: { content: `${prefix}-${name}`, accountId, ...extra } });
      noteIds.push(note.id);
      return note;
    };
    const anchor = await makeNote('shared-anchor');
    const hidden = await makeNote('private');
    const shared = await makeNote('shared-read-only');
    const own = await makeNote('B-owned', b.id);
    const publicOnly = await makeNote('public-without-internal-share', a.id, { isShare: true, shareEncryptedUrl: 'fixture-only' });
    const unreadableAnchor = await makeNote('private-anchor');
    await db.noteInternalShare.createMany({ data: [anchor, shared].map(note => ({ noteId: note.id, accountId: b.id, canEdit: false })) });
    for (const [index, note] of [hidden, shared, own, publicOnly].entries()) {
      await db.noteReference.createMany({ data: [
        { fromNoteId: anchor.id, toNoteId: note.id, createdAt: new Date(1000 + index) },
        { fromNoteId: note.id, toNoteId: anchor.id, createdAt: new Date(2000 + index) },
      ] });
    }
    // A visible neighbour must not make a private anchor queryable.
    await db.noteReference.createMany({ data: [
      { fromNoteId: unreadableAnchor.id, toNoteId: own.id },
      { fromNoteId: own.id, toNoteId: unreadableAnchor.id },
    ] });
    const file = await db.attachments.create({ data: {
      name: 'private.txt', path: '/api/file/fixture-private-no-bytes', size: 12,
      type: 'text/plain', noteId: hidden.id, accountId: a.id,
    } });
    await db.attachments.create({ data: {
      name: 'shared.txt', path: '/api/file/fixture-shared-no-bytes', size: 13,
      type: 'text/plain', noteId: shared.id, accountId: a.id,
    } });
    const parent = await db.tag.create({ data: { name: 'private-parent-A', accountId: a.id } });
    const tag = await db.tag.create({ data: { name: 'private-child-A', parent: parent.id, accountId: a.id, icon: 'original', sortOrder: 10 } });
    const foreignParentChild = await db.tag.create({ data: { name: 'B-child', parent: parent.id, accountId: b.id } });
    fixture = { a, b, admin, anchor, hidden, shared, own, publicOnly, unreadableAnchor, file, parent, tag, foreignParentChild };
  }, 20_000);

  afterAll(async () => {
    if (!db) return;
    try {
      await db.noteReference.deleteMany({ where: { OR: [{ fromNoteId: { in: noteIds } }, { toNoteId: { in: noteIds } }] } });
      await db.attachments.deleteMany({ where: { accountId: { in: accountIds } } });
      await db.tag.deleteMany({ where: { accountId: { in: accountIds } } });
      await db.notes.deleteMany({ where: { id: { in: noteIds } } });
      await db.accounts.deleteMany({ where: { id: { in: accountIds } } });
      console.log(`AUTHZ_PG_EVIDENCE ${JSON.stringify({ database: 'authz', sqlQueries, fixtureAccounts: accountIds.length, fixtureNotes: noteIds.length, cleanup: 'scoped fixture rows only' })}`);
    } finally {
      await db.$disconnect();
      globals.prisma = previousPrisma;
    }
  }, 10_000);

  test.each(['references', 'referencedBy'] as const)('owner gets owned/shared neighbours and private attachment metadata: %s', async type => {
    const { a, anchor, hidden, shared, publicOnly } = fixture;
    const rows = await caller(a).notes.noteReferenceList({ noteId: anchor.id, type });
    expect(ids(rows)).toEqual(ids([hidden, shared, publicOnly]));
    expect(rows.find((row: any) => row.id === hidden.id).attachments[0].path).toBe(fixture.file.path);
    expect(rows.every((row: any) => row.referenceCreatedAt instanceof Date)).toBe(true);
    expect(rows.map((row: any) => +row.referenceCreatedAt)).toEqual(rows.map((row: any) => +row.referenceCreatedAt).sort((a: number, b: number) => b - a));
  });

  test.each(['references', 'referencedBy'] as const)('read-only shared anchor filters hidden content AND attachment metadata: %s', async type => {
    const { b, anchor, hidden, shared, own, publicOnly } = fixture;
    expect((await caller(b).notes.detail({ id: anchor.id })).id).toBe(anchor.id);
    expect(await caller(b).notes.detail({ id: hidden.id })).toBeNull();
    expect(await caller(b).notes.detail({ id: publicOnly.id })).toBeNull();
    const rows = await caller(b).notes.noteReferenceList({ noteId: anchor.id, type });
    expect(ids(rows)).toEqual(ids([shared, own]));
    expect(rows.find((row: any) => row.id === shared.id).attachments[0].name).toBe('shared.txt');
    expect(JSON.stringify(rows)).not.toContain(hidden.content);
    expect(JSON.stringify(rows)).not.toContain(fixture.file.path);
  });

  test.each(['references', 'referencedBy'] as const)('invisible anchor remains empty even when its neighbour is owned: %s', async type => {
    const { b, own, unreadableAnchor } = fixture;
    expect((await caller(b).notes.detail({ id: own.id })).id).toBe(own.id);
    expect(await caller(b).notes.detail({ id: unreadableAnchor.id })).toBeNull();
    expect(await caller(b).notes.noteReferenceList({ noteId: unreadableAnchor.id, type })).toEqual([]);
    expect(await caller(b).notes.noteReferenceList({ noteId: -1, type })).toEqual([]);
    expect(await caller(fixture.admin).notes.noteReferenceList({ noteId: fixture.anchor.id, type })).toEqual([]);
  });

  test('owner tag chain/icon/order work; foreign users (including shared recipients/admin) cannot read or persist changes', async () => {
    const { a, b, admin, tag } = fixture;
    expect(await caller(a).tags.fullTagNameById({ id: tag.id })).toBe('#private-parent-A/private-child-A');
    await caller(a).tags.updateTagIcon({ id: tag.id, icon: 'owner-icon' });
    await caller(a).tags.updateTagOrder({ id: tag.id, sortOrder: 20 });
    const before = await db.tag.findUniqueOrThrow({ where: { id: tag.id } });
    expect(before).toMatchObject({ icon: 'owner-icon', sortOrder: 20 });
    for (const actor of [b, admin]) {
      await expect(caller(actor).tags.fullTagNameById({ id: tag.id })).rejects.toThrow('Tag not found');
      await expect(caller(actor).tags.updateTagIcon({ id: tag.id, icon: 'NONOWNER' })).rejects.toThrow();
      await expect(caller(actor).tags.updateTagOrder({ id: tag.id, sortOrder: 777 })).rejects.toThrow();
      expect(await db.tag.findUniqueOrThrow({ where: { id: tag.id } })).toEqual(before);
    }
    expect(await caller(b).tags.fullTagNameById({ id: fixture.foreignParentChild.id })).toBe('#B-child');
  });

  test.each([['anonymous', {}], ['wrong scope', { permissions: ['users.register'] }]] as const)('%s denied before SQL for note and all three tag endpoints', async (label, extra) => {
    const denied = label === 'anonymous' ? root.createCaller({}) : caller(fixture.b, extra);
    const before = sqlQueries;
    const code = label === 'anonymous' ? 'UNAUTHORIZED' : 'FORBIDDEN';
    for (const type of ['references', 'referencedBy']) {
      await expect(denied.notes.noteReferenceList({ noteId: fixture.anchor.id, type })).rejects.toMatchObject({ code });
    }
    await expect(denied.tags.fullTagNameById({ id: fixture.tag.id })).rejects.toMatchObject({ code });
    await expect(denied.tags.updateTagIcon({ id: fixture.tag.id, icon: 'blocked' })).rejects.toMatchObject({ code });
    await expect(denied.tags.updateTagOrder({ id: fixture.tag.id, sortOrder: 777 })).rejects.toMatchObject({ code });
    expect(sqlQueries).toBe(before);
  });

  test('correctly scoped tokens can still use their permitted endpoints', async () => {
    const { a, tag, anchor } = fixture;
    const scoped = caller(a, { permissions: ['notes.noteReferenceList', 'tags.fullTagNameById', 'tags.updateTagIcon', 'tags.updateTagOrder'] });
    expect((await scoped.notes.noteReferenceList({ noteId: anchor.id })).length).toBe(3);
    expect(await scoped.tags.fullTagNameById({ id: tag.id })).toBe('#private-parent-A/private-child-A');
    await scoped.tags.updateTagIcon({ id: tag.id, icon: 'scoped-owner' });
    await scoped.tags.updateTagOrder({ id: tag.id, sortOrder: 21 });
    expect(await db.tag.findUniqueOrThrow({ where: { id: tag.id } })).toMatchObject({ icon: 'scoped-owner', sortOrder: 21 });
  });
});
