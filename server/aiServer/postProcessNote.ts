import { RequestContext } from '@mastra/core/request-context';
import { prisma } from '../prisma';
import type { Context } from '../context';
import { AiModelFactory } from './aiModelFactory';
import { userCaller } from '../routerTrpc/_app';
import { getAllPathTags } from '@server/lib/helper';
import { commentWebhookInclude, sendCommentWebhook } from '@server/lib/commentWebhook';
import { CreateNotification } from '../routerTrpc/notification';
import { NotificationType } from '@shared/lib/prismaZodType';
import { withNoteWriteGuard, AI_NOTE_WRITE_GUARD_CONTEXT_KEY, readNoteForPostProcessing, type NoteWriteGuard } from '../lib/noteWriteGuard';

export async function postProcessNote({ noteId, ctx }: { noteId: number; ctx: Context }) {
  try {
    const requestContext = new RequestContext();
    requestContext.set('accountId', ctx.id);

    // Get the configuration
    const config = await AiModelFactory.globalConfig();

    // Check if post-processing is enabled
    if (!config.isUseAiPostProcessing) {
      return { success: false, message: 'AI post-processing not enabled' };
    }

    const note = await readNoteForPostProcessing(prisma, noteId);
    let noteType = 'blinko'
    switch (note?.type) {
      case 0:
        noteType = 'blinko';
        break;
      case 1:
        noteType = 'note';
        break;
      case 2:
        noteType = 'todo';
        break;
      default:
        noteType = 'blinko';
    }

    if (!note) {
      return { success: false, message: 'Note not found' };
    }

    const guard: NoteWriteGuard = { noteId, version: note.version };
    requestContext.set(AI_NOTE_WRITE_GUARD_CONTEXT_KEY, guard);
    const caller = userCaller(withNoteWriteGuard(ctx, guard));
    const processingMode = config.aiPostProcessingMode || 'comment';

    // Handle custom processing mode
    if (processingMode === 'custom') {
      // Get all tags for tag replacement
      const tags = await getAllPathTags();
      const tagsList = tags.join(', ');

      // Get custom prompt and replace variables
      let customPrompt = config.aiCustomPrompt || 'Analyze the following note content and provide feedback.';
      customPrompt = customPrompt.replace('{tags}', tagsList).replace('{note}', note.content);
      const withOnlineSearch = !!config.tavilyApiKey;
      // Process with AI using BaseChatAgent with tools

      const agent = await AiModelFactory.BaseChatAgent({
        withTools: true,
        withOnlineSearch: withOnlineSearch,
        extraInstructions: `You are an AI assistant that helps to process notes. You MUST use the available tools to complete your task.
This is a one-time conversation, so you MUST take action immediately using the tools provided.
You have access to tools that can help you modify notes, add comments, or create new notes.
DO NOT just respond with suggestions or analysis - you MUST use the appropriate tool to implement your changes.
If you need to add a comment, use the createCommentTool.
If you need to update the note, use the updateBlinkoTool.
If you need to create a new note, use the upsertBlinkoTool.
Remember: ALWAYS use tools to implement your suggestions rather than just describing what should be done.`,
      });
      const result = await agent.generate([
        {
          role: 'user',
          content: `Current user name: ${ctx.name}\n${customPrompt}\n\nNote ID: ${noteId}\nNote content:\n${note.content}
          Current Note Type: ${noteType}`
        }
      ], {
        requestContext
      });

      if (guard.error) throw guard.error;
      return { success: true, message: 'Custom processing completed' };
    }

    // Get the custom prompt, or use default
    const prompt = config.aiCommentPrompt || 'Analyze the following note content. Extract key topics as tags and provide a brief summary of the main points.';

    // Process with AI
    const agent = await AiModelFactory.CommentAgent();
    const result = await agent.generate([
      {
        role: 'user',
        content: prompt,
      },
      {
        role: 'user',
        content: `Note content: ${note.content}`,
      },
    ]);

    const aiResponse = result.text.trim();

    // Handle based on the processing mode
    if (processingMode === 'comment' || processingMode === 'both') {
      // Add comment
      const comment = await prisma.comments.create({
        data: {
          content: aiResponse,
          noteId,
          guestName: 'Blinko AI',
          guestIP: '',
          guestUA: '',
        },
        include: commentWebhookInclude,
      });
      sendCommentWebhook('comment.created', comment, ctx);

      await CreateNotification({
        accountId: note.accountId ?? 0,
        title: 'ai-post-processing-notification',
        content: 'ai-processed-your-note',
        type: NotificationType.COMMENT,
      });
    }

    if (processingMode === 'tags' || processingMode === 'both') {
      try {
        let suggestedTags: string[] = [];
        // If no clear tag format, process with an agent specialized for tag extraction
        const aiTagsPrompt = config.aiTagsPrompt
        let tagAgent: any;
        if (aiTagsPrompt != '') {
          tagAgent = await AiModelFactory.TagAgent(aiTagsPrompt);
        } else {
          tagAgent = await AiModelFactory.TagAgent();
        }
        const tags = await getAllPathTags();
        const result = await tagAgent.generate(
          `Existing tags list:  [${tags.join(', ')}]\n Note content:\n${note.content}`
        )
        suggestedTags = result.text.split(',').map((tag) => tag.trim());
        // Filter out empty tags and limit to 5 tags max
        suggestedTags = suggestedTags.filter(Boolean).slice(0, 5);
        const saved = await caller.notes.upsert({
          id: noteId,
          content: note.content + '\n' + suggestedTags.join(' '),
        });
        // The next step must use the content AND version written by this run.
        note.content = saved.content;
      } catch (error) {
        console.error('Error processing tags:', error);
        throw error;
      }
    }

    if (processingMode === 'smartEdit' || processingMode === 'both') {
      try {
        const smartEditPrompt = config.aiSmartEditPrompt || 'Improve this note by organizing content, adding headers, and enhancing readability.';
        const agent = await AiModelFactory.BaseChatAgent({
          withTools: true,
          extraInstructions: `You are an AI assistant that helps to improve notes. You'll be provided with a note content, and your task is to enhance it according to instructions. You have access to tools that can help you modify the note. Use these tools to make the requested improvements.`,
        });
        const result = await agent.generate([
          {
            role: 'user',
            content: `\nCurrent user id: ${ctx.id}\nCurrent user name: ${ctx.name}\n${smartEditPrompt}\n\nNote ID: ${noteId}\nNote content:\n${note.content}`
          }
        ], {
          requestContext
        });
        if (guard.error) throw guard.error;
        const comment = await prisma.comments.create({
          data: {
            content: result.text,
            noteId,
            guestName: 'Blinko AI',
            guestIP: '',
            guestUA: '',
          },
          include: commentWebhookInclude,
        });
        sendCommentWebhook('comment.created', comment, ctx);
      } catch (error) {
        console.error('Error during smart edit:', error);
        const comment = await prisma.comments.create({
          data: {
            content: `⚠️ **Smart Edit Error**\n\nI encountered an error while trying to edit this note. This may happen if the AI model doesn't support function calling or if there was an issue with the edit process.\n\nError details: ${error.message}`,
            noteId,
            guestName: 'Blinko AI',
            guestIP: '',
            guestUA: '',
          },
          include: commentWebhookInclude,
        });
        sendCommentWebhook('comment.created', comment, ctx);
        throw error;
      }
    }

    return { success: true, message: 'Note processed successfully' };
  } catch (error) {
    console.error('Error in post-processing note:', error);
    return { success: false, message: error.message || 'Unknown error' };
  }
}
