import { beforeEach, expect, mock, test } from 'bun:test';

// Query-contract regression only. Actual SQL visibility is covered separately
// by integration/note-tag-ownership.test.ts, not inferred from this stub.
const now = new Date();
const note = {
  id: 20, accountId: 1, type: 0, content: 'visible target',
  isArchived: false, isRecycle: false, isShare: false, isTop: false,
  isReviewed: false, sharePassword: '', metadata: null,
  createdAt: now, updatedAt: now, attachments: [],
};
let tags: any[];
const references = mock(async () => [{ toNote: note, fromNote: note, createdAt: now }]);
const findTag = mock(async ({ where }: any) => tags.find(tag => tag.id === where.id && tag.accountId === where.accountId) ?? null);
const updateTag = mock(async ({ where, data }: any) => {
  const tag = tags.find(tag => tag.id === where.id && tag.accountId === where.accountId);
  if (!tag) throw new Error('Tag not found');
  return Object.assign(tag, data);
});
mock.module('../../prisma', () => ({ prisma: { noteReference: { findMany: references }, tag: { findFirst: findTag, update: updateTag } } }));
mock.module('../../routerTrpc/config', () => ({ getGlobalConfig: async () => ({}) }));
mock.module('../../lib/files', () => ({ FileService: {} }));
mock.module('../../lib/helper', () => ({ SendWebhook: () => {} }));
mock.module('../../aiServer', () => ({ AiService: {} }));
mock.module('../../aiServer/aiModelFactory', () => ({ AiModelFactory: {} }));
mock.module('../../routerTrpc/_app', () => ({ userCaller: () => { throw new Error('Unexpected nested call'); } }));
const { router } = await import('../../middleware');
const { noteRouter } = await import('../../routerTrpc/note');
const { tagRouter } = await import('../../routerTrpc/tag');
const root = router({ notes: noteRouter, tags: tagRouter });
const ctx = (id = 1, extra = {}) => ({ id: String(id), sub: String(id), name: `user-${id}`, role: 'user', ...extra }) as any;
const caller = (id = 1) => root.createCaller(ctx(id));

beforeEach(() => {
  references.mockClear(); findTag.mockClear(); updateTag.mockClear();
  tags = [
    { id: 1, accountId: 1, name: 'parent', parent: 0, icon: '', sortOrder: 0, createdAt: now, updatedAt: now },
    { id: 2, accountId: 1, name: 'child', parent: 1, icon: '', sortOrder: 10, createdAt: now, updatedAt: now },
    { id: 3, accountId: 2, name: 'foreign', parent: 0, icon: '', sortOrder: 0, createdAt: now, updatedAt: now },
  ];
});

test.each(['references', 'referencedBy'] as const)('real note resolver constrains both relation endpoints: %s', async type => {
  const rows = await caller().notes.noteReferenceList({ noteId: 10, type });
  expect(rows).toEqual([{ ...note, referenceCreatedAt: now }]);
  const args = references.mock.calls[0] as any;
  const visible = { OR: [{ accountId: 1 }, { internalShares: { some: { accountId: 1 } } }] };
  expect(args[0].where).toEqual({
    [type === 'references' ? 'fromNoteId' : 'toNoteId']: 10,
    fromNote: visible, toNote: visible,
  });
  expect(args[0].orderBy).toEqual({ createdAt: 'desc' });
  expect(args[0].include[type === 'references' ? 'toNote' : 'fromNote'].include.attachments).toBe(true);
});

test('owner reads complete tag chain and updates icon/order using owner-scoped queries', async () => {
  expect(await caller().tags.fullTagNameById({ id: 2 })).toBe('#parent/child');
  expect(findTag.mock.calls.map(([args]) => args.where)).toEqual([{ id: 2, accountId: 1 }, { id: 1, accountId: 1 }]);
  expect((await caller().tags.updateTagIcon({ id: 2, icon: 'owner-icon' })).icon).toBe('owner-icon');
  expect((await caller().tags.updateTagOrder({ id: 2, sortOrder: 42 })).sortOrder).toBe(42);
  expect(updateTag.mock.calls.map(([args]) => args.where)).toEqual([{ id: 2, accountId: 1 }, { id: 2, accountId: 1 }]);
});

test('nonowner cannot read or modify another account’s tag', async () => {
  const before = structuredClone(tags);
  await expect(caller(2).tags.fullTagNameById({ id: 2 })).rejects.toThrow('Tag not found');
  await expect(caller(2).tags.updateTagIcon({ id: 2, icon: 'blocked' })).rejects.toThrow();
  await expect(caller(2).tags.updateTagOrder({ id: 2, sortOrder: 999 })).rejects.toThrow();
  expect(tags).toEqual(before);
});

test('a foreign parent cannot disclose its name through an owned child', async () => {
  tags[1].parent = 3;
  expect(await caller().tags.fullTagNameById({ id: 2 })).toBe('#child');
  expect(findTag.mock.calls[1]![0].where).toEqual({ id: 3, accountId: 1 });
});

test.each([['anonymous', {}], ['wrong scope', ctx(1, { permissions: ['users.register'] })]] as const)('%s is rejected before database access', async (_label, context) => {
  const denied = root.createCaller(context as any);
  const code = _label === 'anonymous' ? 'UNAUTHORIZED' : 'FORBIDDEN';
  await expect(denied.notes.noteReferenceList({ noteId: 10 })).rejects.toMatchObject({ code });
  await expect(denied.tags.fullTagNameById({ id: 2 })).rejects.toMatchObject({ code });
  await expect(denied.tags.updateTagIcon({ id: 2, icon: 'blocked' })).rejects.toMatchObject({ code });
  await expect(denied.tags.updateTagOrder({ id: 2, sortOrder: 999 })).rejects.toMatchObject({ code });
  expect(references).not.toHaveBeenCalled(); expect(findTag).not.toHaveBeenCalled(); expect(updateTag).not.toHaveBeenCalled();
});
