import { expect, it, mock } from 'bun:test';
import type { RequestContext } from '@mastra/core/request-context';
import type { QueueOptions } from 'pg-boss';

// Load the real shared configuration, but never start pg-boss or connect to a DB.
const { scheduledQueueOptions } = await import('@server/lib/pgBoss');
type Payload = { taskId: number; accountId: number; prompt: string };
type Task = { id: number; name: string; prompt: string; schedule: string; accountId: number; isEnabled: boolean };
type JobHandler = (jobs: Array<{ data: Payload }>) => Promise<unknown>;
type TaskUpdate = { where: { id: number }; data: Partial<Task> & { lastRun?: Date; lastResult?: unknown } };
const mainQueue = 'ai-scheduled-task';
const staleOptions = { retryLimit: 0, retryDelay: 0, retryBackoff: false, deleteAfterSeconds: 1 };
const queues = new Map<string, QueueOptions>([[mainQueue, { ...staleOptions }], [`${mainQueue}-5`, { ...staleOptions }]]);
const workers = new Map<string, JobHandler>();
const queueCalls: Array<{ action: 'create' | 'update'; name: string }> = [];
const schedules = new Map<string, { cron: string; data: Payload; options: { tz: string } }>();
const sent: Array<{ name: string; data: Payload }> = [];
const stopped: string[] = [];
const tasks = new Map<number, Task>([[5, { id: 5, name: 'Local task', prompt: 'local task', schedule: '0 * * * *', accountId: 42, isEnabled: true }]]);
let storedResult: unknown;
let seenAccount: unknown;
let seenPrompt: unknown;
let listQuery: unknown;
const boss = {
  // pg-boss createQueue leaves existing settings alone; updateQueue is essential.
  createQueue: async (name: string, options: QueueOptions = {}) => {
    queueCalls.push({ action: 'create', name });
    if (!queues.has(name)) queues.set(name, { ...options });
  },
  updateQueue: async (name: string, options: QueueOptions) => {
    queueCalls.push({ action: 'update', name });
    if (!queues.has(name)) throw new Error('Queue must exist before update');
    queues.set(name, { ...queues.get(name), ...options });
  },
  work: async (name: string, _options: unknown, handler: JobHandler) => {
    workers.set(name, handler);
    return `local-worker-${name}`;
  },
  schedule: async (name: string, cron: string, data: Payload, options: { tz: string }) => { schedules.set(name, { cron, data, options }); },
  send: async (name: string, data: Payload) => { sent.push({ name, data }); return 'local-job-id'; },
  unschedule: async (name: string) => { schedules.delete(name); },
  offWork: async (name: string) => { stopped.push(name); workers.delete(name); },
};
mock.module('@server/lib/pgBoss', () => ({ scheduledQueueOptions, getPgBoss: async () => boss }));
mock.module('@server/prisma', () => ({ prisma: { aiScheduledTask: {
  findUnique: async ({ where }: { where: { id: number } }) => tasks.get(where.id),
  findFirst: async ({ where }: { where: { id: number; accountId: number } }) => {
    const task = tasks.get(where.id);
    return task?.accountId === where.accountId ? task : null;
  },
  findMany: async (query: { where: { isEnabled?: boolean; accountId?: number }; orderBy?: unknown }) => {
    listQuery = query;
    return [...tasks.values()].filter(task => (query.where.isEnabled === undefined || task.isEnabled === query.where.isEnabled) && (query.where.accountId === undefined || task.accountId === query.where.accountId));
  },
  create: async ({ data }: { data: Omit<Task, 'id'> }) => {
    const task = { ...data, id: 6 };
    tasks.set(task.id, task);
    return task;
  },
  update: async (input: TaskUpdate) => {
    storedResult = input;
    Object.assign(tasks.get(input.where.id)!, input.data);
    return input;
  },
  delete: async ({ where }: { where: { id: number } }) => { tasks.delete(where.id); },
} } }));
mock.module('@server/aiServer', () => ({ AiService: {} }));
mock.module('@server/aiServer/aiModelFactory', () => ({ AiModelFactory: {
  BaseChatAgent: async (options: unknown) => {
    expect(options).toMatchObject({ withTools: true, withOnlineSearch: true, withMcpTools: true });
    return {
      stream: async (messages: unknown, { requestContext }: { requestContext: RequestContext }) => {
        seenAccount = requestContext.get('accountId');
        seenPrompt = messages;
        return { fullStream: new ReadableStream({ start(controller) {
          controller.enqueue({ type: 'text-delta', payload: { text: 'scheduled ' } });
          controller.enqueue({ type: 'text-delta', payload: { text: 'result' } });
          controller.close();
        } }) };
      },
    };
  },
} }));
const { AIScheduledTaskJob, AI_SCHEDULED_TASK_QUEUE } = await import('@server/jobs/aiScheduledTaskJob');

it('migrates existing main and enabled task queues before registering workers and schedules', async () => {
  expect(scheduledQueueOptions).toEqual({ retryLimit: 3, retryDelay: 60, retryBackoff: true, deleteAfterSeconds: 604800 });
  await AIScheduledTaskJob.initialize();
  expect(queueCalls).toEqual([
    { action: 'create', name: mainQueue }, { action: 'update', name: mainQueue },
    { action: 'create', name: `${mainQueue}-5` }, { action: 'update', name: `${mainQueue}-5` },
  ]);
  expect(queues.get(mainQueue)).toEqual(scheduledQueueOptions);
  expect(queues.get(`${mainQueue}-5`)).toEqual(scheduledQueueOptions);
  expect(schedules.get(`${mainQueue}-5`)).toEqual({ cron: '0 * * * *', data: { taskId: 5, accountId: 42, prompt: 'local task' }, options: { tz: 'UTC' } });
  await AIScheduledTaskJob.initialize();
  expect(queueCalls).toHaveLength(4);
});

it('executes a queued AI task with its account context and persists payload-based stream text', async () => {
  const handler = workers.get(AI_SCHEDULED_TASK_QUEUE);
  expect(handler).toBeDefined();
  await handler!([{ data: { taskId: 5, accountId: 42, prompt: 'local task' } }]);
  expect(seenAccount).toBe(42);
  expect(seenPrompt).toEqual([{ role: 'user', content: 'local task' }]);
  expect(storedResult).toMatchObject({ where: { id: 5 }, data: { lastResult: { success: true, result: 'scheduled result' } } });
});

it('configures a new task queue and preserves UTC scheduling and forwarding payloads', async () => {
  expect(await AIScheduledTaskJob.createTask({ name: 'New task', prompt: 'new prompt', schedule: '15 * * * *', accountId: 42 })).toEqual({ id: 6, name: 'New task' });
  expect(queues.get(`${mainQueue}-6`)).toEqual(scheduledQueueOptions);
  const payload = { taskId: 6, accountId: 42, prompt: 'new prompt' };
  expect(schedules.get(`${mainQueue}-6`)).toEqual({ cron: '15 * * * *', data: payload, options: { tz: 'UTC' } });
  await workers.get(`${mainQueue}-6`)!([{ data: payload }]);
  expect(sent.at(-1)).toEqual({ name: mainQueue, data: payload });
  const before = queueCalls.length;
  await expect(AIScheduledTaskJob.createTask({ name: 'Invalid', prompt: 'invalid', schedule: 'bad', accountId: 42 })).rejects.toThrow('Invalid cron expression');
  expect(queueCalls).toHaveLength(before);
});

it('migrates an existing queue on re-enable and retains disable cleanup behavior', async () => {
  expect(await AIScheduledTaskJob.toggleTask(5, 42, false)).toBe(true);
  expect(tasks.get(5)?.isEnabled).toBe(false);
  expect(schedules.has(`${mainQueue}-5`)).toBe(false);
  expect(workers.has(`${mainQueue}-5`)).toBe(false);
  queues.set(`${mainQueue}-5`, { ...staleOptions });
  expect(await AIScheduledTaskJob.toggleTask(5, 42, true)).toBe(true);
  expect(queues.get(`${mainQueue}-5`)).toEqual(scheduledQueueOptions);
  expect(tasks.get(5)?.isEnabled).toBe(true);
  expect(schedules.get(`${mainQueue}-5`)?.data.accountId).toBe(42);
  expect(workers.has(`${mainQueue}-5`)).toBe(true);
});

it('retains account-scoped list, run-now and unauthorized mutation behavior', async () => {
  tasks.set(77, { ...tasks.get(5)!, id: 77, accountId: 99 });
  expect((await AIScheduledTaskJob.getTasks(42)).every(task => task.accountId === 42)).toBe(true);
  expect(listQuery).toEqual({ where: { accountId: 42 }, orderBy: { createdAt: 'desc' } });
  expect(await AIScheduledTaskJob.runNow(5, 42)).toBe('local-job-id');
  expect(sent.at(-1)).toEqual({ name: mainQueue, data: { taskId: 5, accountId: 42, prompt: 'local task' } });
  const before = { queues: queueCalls.length, sends: sent.length, stops: stopped.length };
  await expect(AIScheduledTaskJob.deleteTask(5, 99)).rejects.toThrow('access denied');
  await expect(AIScheduledTaskJob.toggleTask(5, 99, true)).rejects.toThrow('access denied');
  await expect(AIScheduledTaskJob.runNow(5, 99)).rejects.toThrow('access denied');
  expect({ queues: queueCalls.length, sends: sent.length, stops: stopped.length }).toEqual(before);
  expect(tasks.has(5)).toBe(true);
});

it('deletes only the owned task and its schedule/worker, retaining the existing queue', async () => {
  expect(await AIScheduledTaskJob.deleteTask(5, 42)).toBe(true);
  expect(tasks.has(5)).toBe(false);
  expect(schedules.has(`${mainQueue}-5`)).toBe(false);
  expect(workers.has(`${mainQueue}-5`)).toBe(false);
  expect(queues.has(`${mainQueue}-5`)).toBe(true);
  expect(stopped.at(-1)).toBe(`${mainQueue}-5`);
});
