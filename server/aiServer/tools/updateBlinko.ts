import { userCaller } from '@server/routerTrpc/_app';
import { NoteType } from '@shared/lib/types';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod/v3';
import { verifyToken } from '@server/lib/helper';
import { withNoteWriteGuard, AI_NOTE_WRITE_GUARD_CONTEXT_KEY, type NoteWriteGuard } from '@server/lib/noteWriteGuard';

export const updateBlinkoTool = createTool({
  id: 'update-blinko-tool',
  description: 'you are a blinko assistant,you can use api to update blinko,save to database',
  inputSchema: z.object({
    id: z.number().describe('the note ID'),
    content: z.string().describe('note content'),
    type: z.string().optional().default('blinko').describe('Optional: The type of content: "blinko" (flash thoughts/sudden ideas/fleeting inspiration - the default), "note" (longer, structured content), or "todo" (tasks to be done)'),
    isArchived: z.union([z.boolean(), z.null()]).default(null).describe('is archived'),
    isTop: z.union([z.boolean(), z.null()]).default(null).describe('is top'),
    isShare: z.union([z.boolean(), z.null()]).default(null),
    isRecycle: z.union([z.boolean(), z.null()]).default(null),
    token: z.string().optional().describe("internal use, do not pass!")
  }),
  execute: async (context, { requestContext }) => {
    const accountId = requestContext.get('accountId') || (await verifyToken(context.token ?? ''))?.sub;
    const guard = requestContext.get(AI_NOTE_WRITE_GUARD_CONTEXT_KEY) as NoteWriteGuard | undefined;
    let noteType: NoteType;
    const typeStr = (context.type || 'blinko').toLowerCase();

    switch (typeStr) {
      case 'note':
      case '1':
        noteType = NoteType.NOTE; // 1
        break;
      case 'todo':
      case '2':
        noteType = NoteType.TODO; // 2
        break;
      case 'blinko':
      case '0':
      default:
        noteType = NoteType.BLINKO; // 0
        break;
    }
    try {
      const caller = userCaller(withNoteWriteGuard({
        id: String(accountId),
        exp: 0,
        iat: 0,
        name: 'admin',
        sub: String(accountId),
        role: 'superadmin'
      }, guard))
      return await caller.notes.upsert({
        content: context.content,
        type: noteType,
        id: context.id
      })
    } catch (error) {
      // Mastra may turn tool failures into model-visible results rather than
      // reject generate(). Preserve the failure for the post-processing run.
      if (guard) {
        guard.error = error;
        throw error;
      }
      console.log(error)
      return error.message
    }
  }
});