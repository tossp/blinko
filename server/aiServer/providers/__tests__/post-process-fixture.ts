import { mock } from 'bun:test';
import type { Context } from '../../../context';

// Shared only by isolated Bun suites. Everything from the resolver through the
// transaction and update tool is real; external AI and delivery are local stubs.
export async function postProcessFixture(db: any) {
  const control = {
    accountId: 1,
    mode: 'both',
    enabled: true,
    commentFactory: async () => {},
    commentGenerate: async () => ({ text: 'summary' }),
    tagGenerate: async () => ({ text: '#tag' }),
    baseFactory: async () => {},
    baseGenerate: async (_messages: any, _options: any): Promise<any> => ({ text: 'edited' }),
    commentsSent: [] as any[],
    webhooks: [] as any[],
  };
  let noteRouter: any;
  mock.module('@server/prisma', () => ({ prisma: db }));
  mock.module('@server/routerTrpc/_app', () => ({
    userCaller: (ctx: Context) => ({ notes: noteRouter.createCaller(ctx) }),
  }));
  mock.module('@server/routerTrpc/config', () => ({ getGlobalConfig: async () => ({}) }));
  mock.module('@server/lib/files', () => ({ FileService: {} }));
  mock.module('@server/lib/helper', () => ({
    getAllPathTags: async () => [],
    verifyToken: async (token: string) => token === 'valid' ? { sub: String(control.accountId) } : null,
    SendWebhook: (note: any, event: string) => control.webhooks.push({ note, event }),
  }));
  mock.module('@server/lib/commentWebhook', () => ({
    commentWebhookInclude: {},
    sendCommentWebhook: (_event: string, comment: any) => control.commentsSent.push(comment),
  }));
  mock.module('@server/routerTrpc/notification', () => ({ CreateNotification: async () => {} }));
  mock.module('@server/aiServer', () => ({ AiService: {} }));
  mock.module('@server/aiServer/aiModelFactory', () => ({
    AiModelFactory: {
      globalConfig: async () => ({ isUseAiPostProcessing: control.enabled, aiPostProcessingMode: control.mode, aiTagsPrompt: '' }),
      CommentAgent: async () => { await control.commentFactory(); return { generate: (...args: any[]) => (control.commentGenerate as any)(...args) }; },
      TagAgent: async () => ({ generate: (...args: any[]) => (control.tagGenerate as any)(...args) }),
      BaseChatAgent: async () => { await control.baseFactory(); return { generate: (...args: any[]) => (control.baseGenerate as any)(...args) }; },
    },
  }));
  ({ noteRouter } = await import('../../../routerTrpc/note'));
  const { postProcessNote } = await import('../../postProcessNote');
  const { updateBlinkoTool } = await import('../../tools/updateBlinko');
  const ctx = (): Context => ({ id: String(control.accountId), sub: String(control.accountId), name: 'post-process-test', role: 'user', exp: 0, iat: 0 });
  const caller = (context = ctx()) => noteRouter.createCaller(context);
  const updateTool = (id: number, content: string, requestContext: any, type = 'blinko') =>
    updateBlinkoTool.execute!({ id, content, type, isArchived: null, isTop: null, isShare: null, isRecycle: null }, { requestContext } as any);
  return { control, ctx, caller, updateTool, run: (noteId: number) => postProcessNote({ noteId, ctx: ctx() }) };
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
