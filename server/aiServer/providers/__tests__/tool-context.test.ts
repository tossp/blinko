import { describe, expect, it, mock } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';

let calledAccount: string | undefined;
let tokenChecks = 0;
let taskAccount: number | undefined;
mock.module('@server/routerTrpc/_app', () => ({
  userCaller: (context: { id: string }) => {
    calledAccount = context.id;
    return { notes: { upsert: async (input: unknown) => input } };
  },
}));
mock.module('@server/lib/helper', () => ({
  verifyToken: async (token: string) => { tokenChecks++; return token === 'valid' ? { sub: '7', id: '7' } : null; },
}));
mock.module('@server/jobs/aiScheduledTaskJob', () => ({
  AIScheduledTaskJob: {
    createTask: async (input: { accountId: number }) => { taskAccount = input.accountId; return { id: 1, name: 'test' }; },
  },
}));
mock.module('@server/prisma', () => ({ prisma: {} }));
const { upsertBlinkoTool } = await import('../../tools/createBlinko');
const { createScheduledTaskTool } = await import('../../tools/scheduledTask');

const context = () => ({ requestContext: new RequestContext() });

describe('Mastra 1 tool execution auth context migration', () => {
  it('passes parsed input separately and prioritizes trusted request account over a model-supplied token', async () => {
    const execution = context();
    execution.requestContext.set('accountId', 42);
    const before = tokenChecks;
    await upsertBlinkoTool.execute!({ content: 'local', type: 'blinko', token: 'valid' }, execution);
    expect(calledAccount).toBe('42');
    expect(tokenChecks).toBe(before);
  });

  it('retains token authentication fallback for existing tool callers', async () => {
    await upsertBlinkoTool.execute!({ content: 'local', type: 'blinko', token: 'valid' }, context());
    expect(calledAccount).toBe('7');
  });

  it('keeps scheduled task creation scoped to the authenticated account', async () => {
    const execution = context();
    execution.requestContext.set('accountId', 42);
    await createScheduledTaskTool.execute!({ name: 'test', prompt: 'test', schedule: '0 1 * * *', token: 'valid' }, execution);
    expect(taskAccount).toBe(42);
    const rejected = await createScheduledTaskTool.execute!({ name: 'test', prompt: 'test', schedule: '0 1 * * *' }, context());
    expect(rejected).toMatchObject({ success: false, error: 'No authentication provided' });
  });
});
