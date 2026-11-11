import { beforeEach, expect, test } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';
import { postProcessFixture, deferred } from './post-process-fixture';

let note: any;
let histories: any[];
let comments: any[];
let sequence = 1;
let transactionVersion: string | undefined;
const db: any = {
  $queryRaw: async (query: TemplateStringsArray, ...values: any[]) => {
    if (query.join('').includes('SELECT id, content')) return note && values[0] === note.id ? [{ ...note }] : [];
    if (query.join('').includes('UPDATE notes SET content = content')) {
      if (values[0] !== note.id || values[1] !== note.version) return [];
      note.version = transactionVersion;
      return [{ version: note.version }];
    }
    throw Error('Unexpected raw query');
  },
  $transaction: async (fn: any) => {
    const before = structuredClone({ note, histories });
    transactionVersion = String(++sequence);
    try { return await fn(db); }
    catch (error) { ({ note, histories } = before); throw error; }
    finally { transactionVersion = undefined; }
  },
  notes: {
    findFirst: async ({ where }: any) => where.id === note.id ? { ...note } : null,
    findUnique: async () => ({ ...note }),
    update: async ({ data }: any) => { Object.assign(note, data, { version: transactionVersion }); return { ...note }; },
  },
  noteHistory: {
    findFirst: async () => histories.at(-1),
    create: async ({ data }: any) => { histories.push(data); return data; },
  },
  comments: { create: async ({ data }: any) => { comments.push(data); return data; } },
  tagsToNote: { findMany: async () => [], findFirst: async () => ({}), create: async ({ data }: any) => data, deleteMany: async () => ({ count: 0 }) },
  tag: { findFirst: async () => ({ id: 5, name: 'tag', parent: 0 }), deleteMany: async () => ({ count: 0 }) },
  noteReference: { findMany: async () => [] },
};
const fixture = await postProcessFixture(db);
const { control, caller, updateTool, run } = fixture;

beforeEach(() => {
  note = { id: 42, content: 'original', type: 1, accountId: 1, version: String(++sequence), createdAt: new Date(), updatedAt: new Date() };
  histories = [];
  comments = [];
  control.mode = 'both';
  control.enabled = true;
  control.commentFactory = async () => {};
  control.commentGenerate = async () => ({ text: 'summary' });
  control.tagGenerate = async () => ({ text: '#tag' });
  control.baseFactory = async () => {};
  control.baseGenerate = async (_messages, { requestContext }) => {
    await updateTool(42, 'smart result #tag', requestContext, 'note');
    return { text: 'smart success' };
  };
  control.commentsSent.length = 0;
  control.webhooks.length = 0;
});

test('editing after the snapshot but before generation keeps the user edit and reports failure', async () => {
  control.commentFactory = async () => { await caller().upsert({ id: 42, content: 'user edit' }); };
  expect((await run(42)).success).toBe(false);
  expect(note.content).toBe('user edit');
  expect(histories.map(row => row.content)).toEqual(['original']);
  expect(comments.some(row => row.content === 'smart success')).toBe(false);
});

test('editing while tag generation is pending cannot be overwritten', async () => {
  const entered = deferred();
  const release = deferred();
  control.tagGenerate = async () => { entered.resolve(); await release.promise; return { text: '#stale' }; };
  const processing = run(42);
  await entered.promise;
  await caller().upsert({ id: 42, content: 'edited while waiting' });
  release.resolve();
  expect((await processing).success).toBe(false);
  expect(note.content).toBe('edited while waiting');
  expect(histories).toHaveLength(1);
});

test('both mode awaits tags, advances the same run version and supplies tagged content to smartEdit', async () => {
  control.baseGenerate = async (messages, { requestContext }) => {
    expect(messages[0].content).toContain('original\n#tag');
    expect(note.content).toBe('original\n#tag');
    await updateTool(42, 'smart result #tag', requestContext, 'note');
    return { text: 'smart success' };
  };
  expect((await run(42)).success).toBe(true);
  expect(note.content).toBe('smart result #tag');
  expect(note.type).toBe(1);
  expect(histories.map(row => row.content)).toEqual(['original', 'original\n#tag']);
  expect(control.webhooks.map(row => row.event)).toEqual(['update', 'update']);
});

test.each(['smartEdit', 'custom'])('%s tool failures cannot be hidden by an apparently successful agent response', async mode => {
  control.mode = mode;
  control.baseGenerate = async (_messages, { requestContext }) => {
    await caller().upsert({ id: 42, content: 'user edit during tool wait' });
    // Simulate Mastra returning a tool error to the model and continuing.
    try { await updateTool(42, 'stale tool result', requestContext); } catch {}
    return { text: 'falsely claimed success' };
  };
  expect((await run(42)).success).toBe(false);
  expect(note.content).toBe('user edit during tool wait');
  expect(histories.map(row => row.content)).toEqual(['original']);
  expect(comments.some(row => row.content === 'falsely claimed success')).toBe(false);
});

test('a user edit between tags and smartEdit wins over the advanced AI version', async () => {
  control.baseFactory = async () => { await caller().upsert({ id: 42, content: 'user edit after tags' }); };
  expect((await run(42)).success).toBe(false);
  expect(note.content).toBe('user edit after tags');
  expect(histories.map(row => row.content)).toEqual(['original', 'original\n#tag']);
});

test('multiple sequential custom tool writes in one run remain valid', async () => {
  control.mode = 'custom';
  control.baseGenerate = async (_messages, { requestContext }) => {
    await updateTool(42, 'step one', requestContext, 'note');
    await updateTool(42, 'step two', requestContext, 'note');
    return { text: 'done' };
  };
  expect((await run(42)).success).toBe(true);
  expect(note.content).toBe('step two');
  expect(histories.map(row => row.content)).toEqual(['original', 'step one']);
});

test('ordinary MCP update calls retain token fallback and do not get an AI version constraint', async () => {
  const requestContext = new RequestContext();
  const { updateBlinkoTool } = await import('../../tools/updateBlinko');
  const result = await updateBlinkoTool.execute!({ id: 42, content: 'MCP update', type: 'note', token: 'valid', isArchived: null, isTop: null, isShare: null, isRecycle: null }, { requestContext } as any);
  expect(result).toMatchObject({ content: 'MCP update', type: 1 });
  expect(note.content).toBe('MCP update');
});

test('ordinary MCP update errors retain the existing error-string result', async () => {
  const requestContext = new RequestContext();
  requestContext.set('accountId', 1);
  expect(await updateTool(-1, 'not allowed', requestContext)).toBe('Note not found or you do not have edit permission');
  expect(note.content).toBe('original');
  expect(histories).toHaveLength(0);
});

test('disabled processing and a missing note do not report successful writes', async () => {
  control.enabled = false;
  expect((await run(42)).success).toBe(false);
  control.enabled = true;
  expect((await run(-1)).success).toBe(false);
  expect(histories).toHaveLength(0);
});
