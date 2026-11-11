import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { prisma } from '../prisma';
import { AiModelFactory } from './aiModelFactory';
import type { VectorNoteFilter } from './vectorQuery';
import { ProgressResult } from '@shared/lib/types';
import { loadFileContent } from './fileContent';
import { FileService } from '../lib/files';
import { Context } from '../context';
import { CreateNotification } from '../routerTrpc/notification';
import { NotificationType } from '@shared/lib/prismaZodType';
import type { ModelMessage } from 'ai';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';
import { RebuildEmbeddingJob } from '../jobs/rebuildEmbeddingJob';
import { postProcessNote } from './postProcessNote';
import { RequestContext } from '@mastra/core/request-context';
import { commentWebhookInclude, sendCommentWebhook } from '@server/lib/commentWebhook';
import { LibSQLVector } from '@mastra/libsql';

export function isImage(filePath: string): boolean {
  if (!filePath) return false;
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
  return imageExtensions.some((ext) => filePath.toLowerCase().endsWith(ext));
}

export function isAudio(filePath: string): boolean {
  if (!filePath) return false;
  const audioExtensions = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.opus', '.webm'];
  return audioExtensions.some((ext) => filePath.toLowerCase().endsWith(ext));
}

export class AiService {
  static isImage = isImage;
  static isAudio = isAudio;

  static loadFileContent = loadFileContent;

  static async embeddingDeleteAll(id: number, VectorStore: LibSQLVector) {
    await VectorStore.truncateIndex({ indexName: 'blinko' });
  }

  static async embeddingDeleteAllAttachments(filePath: string, VectorStore: LibSQLVector) {
    await VectorStore.truncateIndex({ indexName: 'blinko' });
  }

  static async embeddingUpsert({ id, content, type, createTime, updatedAt }: { id: number; content: string; type: 'update' | 'insert'; createTime: Date; updatedAt?: Date }) {
    try {
      const { VectorStore, Embeddings } = await AiModelFactory.GetProvider();
      if (!Embeddings) {
        throw new Error("No embeddings model config")
      }
      const config = await AiModelFactory.globalConfig();

      if (config.excludeEmbeddingTagId) {
        const tag = await prisma.tag.findUnique({ where: { id: config.excludeEmbeddingTagId } });
        if (tag && content.includes(tag.name)) {
          console.warn('this note is not allowed to be embedded:', tag.name);
          return { ok: false, msg: 'tag is not allowed to be embedded' };
        }
      }

      const note = await prisma.notes.findUnique({
        where: { id },
        select: { metadata: true, attachments: true }
      });

      const chunks = await MDocument.fromMarkdown(content).chunk();
      if (type == 'update') {
        AiModelFactory.queryAndDeleteVectorById(id);
      }

      const { embeddings } = await embedMany({
        values: chunks.map((chunk) => chunk.text + 'Create At: ' + createTime.toISOString() + ' Update At: ' + updatedAt?.toISOString()),
        model: Embeddings,
      });

      await VectorStore.upsert({
        indexName: 'blinko',
        vectors: embeddings,
        metadata: chunks?.map((chunk) => ({ text: chunk.text, id, noteId: id, createTime, updatedAt })),
      });

      try {
        await prisma.notes.update({
          where: { id },
          data: {
            metadata: {
              //@ts-ignore
              ...(note?.metadata || {}),
              isIndexed: true,
            },
            updatedAt,
          },
        });
      } catch (error) {
        console.log(error);
      }

      return { ok: true };
    } catch (error) {
      console.log(error, 'embeddingUpsert error');
      return { ok: false, error: error?.message };
    }
  }

  //api/file/123.pdf
  static async embeddingInsertAttachments({ id, updatedAt, filePath }: { id: number; updatedAt?: Date; filePath: string }) {
    try {

      const fileResult = await FileService.getFile(filePath);
      let content: string;
      try {
        if (AiService.isImage(filePath)) {
          content = await AiModelFactory.describeImage(fileResult.path);
        } else {
          content = await AiService.loadFileContent(fileResult.path);
        }
      } finally {
        // Clean up temporary file if needed
        if (fileResult.isTemporary && fileResult.cleanup) {
          await fileResult.cleanup();
        }
      }
      const { VectorStore, TokenTextSplitter, Embeddings } = await AiModelFactory.GetProvider();
      if (!Embeddings) {
        throw new Error("No embeddings model config")
      }
      const doc = MDocument.fromText(content);
      const chunks = await doc.chunk();

      const { embeddings } = await embedMany({
        values: chunks.map((chunk) => chunk.text + 'Create At: ' + updatedAt?.toISOString() + ' Update At: ' + updatedAt?.toISOString()),
        model: Embeddings,
      });

      await VectorStore.upsert({
        indexName: 'blinko',
        vectors: embeddings,
        metadata: chunks?.map((chunk) => ({ text: chunk.text, id, noteId: id, isAttachment: true, updatedAt })),
      });

      try {
        const note = await prisma.notes.findUnique({
          where: { id },
          select: { metadata: true }
        });
        await prisma.notes.update({
          where: { id },
          data: {
            metadata: {
              //@ts-ignore
              ...(note?.metadata || {}),
              isIndexed: true,
              isAttachmentsIndexed: true,
            },
            updatedAt,
          },
        });
      } catch (error) {
        console.log(error);
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }

  static async embeddingDelete({ id }: { id: number }) {
    AiModelFactory.queryAndDeleteVectorById(id);
    return { ok: true };
  }

  static async *rebuildEmbeddingIndex({ force = false }: { force?: boolean }): AsyncGenerator<ProgressResult & { progress?: { current: number; total: number } }, void, unknown> {
    // This method is now a wrapper around the RebuildEmbeddingJob
    // We'll just return a simple message directing to use the job instead
    yield {
      type: 'info' as const,
      content: 'Rebuild embedding index task started - check task progress for details',
      progress: { current: 0, total: 0 },
    };

    // Start the job
    await RebuildEmbeddingJob.ForceRebuild(force);
  }

  static getChatHistory({ conversations }: { conversations: { role: string; content: string }[] }) {
    const conversationMessage = conversations.map((i) => {
      if (i.role == 'user') {
        return new HumanMessage(i.content);
      }
      return new AIMessage(i.content);
    });
    conversationMessage.pop();
    return conversationMessage;
  }

  static async enhanceQuery({ query, ctx, filter }: { query: string; ctx: Context; filter?: VectorNoteFilter }) {
    try {
      const { notes } = await AiModelFactory.queryVector(query, Number(ctx.id), undefined, filter);
      return notes;
    } catch (error) {
      console.error('Error in enhanceQuery:', error);
      return [];
    }
  }

  static async completions({
    question,
    conversations,
    withTools,
    withRAG = true,
    withOnline = false,
    systemPrompt,
    ctx,
  }: {
    question: string;
    conversations: ModelMessage[];
    withTools?: boolean;
    withRAG?: boolean;
    withOnline?: boolean;
    systemPrompt?: string;
    ctx: Context;
  }) {
    try {
      console.log('completions');

      // Fold all system context into a single agent instruction so that only ONE
      // system message reaches the model. Some providers (e.g. Qwen/DashScope) reject
      // multiple leading system messages with "System message must be at the beginning".
      // See https://github.com/blinkospace/blinko/issues/1122
      const historySystem = conversations
        .filter((m) => m.role === 'system')
        .map((m) => m.content as string);
      const cleanedConversations = conversations.filter((m) => m.role !== 'system');

      let ragNote: any[] = [];
      let ragNoteString = '';
      if (withRAG) {
        let { notes, aiContext } = await AiModelFactory.queryVector(question, Number(ctx.id));
        ragNote = notes;
        ragNoteString = `This is the note content ${ragNote.map((i) => i.content).join('\n')} ${aiContext}`;
      }

      const contextParts = [
        ...historySystem,
        `Current user name: ${ctx.name}`,
        systemPrompt,
        ragNoteString,
      ].filter(Boolean);

      cleanedConversations.push({
        role: 'user',
        content: question,
      });
      console.log(cleanedConversations, 'conversations');
      const requestContext = new RequestContext();
      requestContext.set('accountId', Number(ctx.id));
      const agent = await AiModelFactory.BaseChatAgent({
        withTools,
        withOnlineSearch: withOnline,
        extraInstructions: contextParts.join('\n\n'),
      });
      const result = await agent.stream(cleanedConversations, { requestContext });
      return { result, notes: ragNote };
    } catch (error) {
      console.log(error);
      throw new Error(error);
    }
  }

  static async AIComment({ content, noteId }: { content: string; noteId: number }) {
    try {
      const note = await prisma.notes.findUnique({
        where: { id: noteId },
        select: { content: true, accountId: true },
      });

      if (!note) {
        throw new Error('Note not found');
      }

      const agent = await AiModelFactory.CommentAgent();
      const result = await agent.generate([
        {
          role: 'user',
          content: content,
        },
        {
          role: 'user',
          content: `This is the note content: ${note.content}`,
        },
      ]);

      const comment = await prisma.comments.create({
        data: {
          content: result.text.trim(),
          noteId,
          guestName: 'Blinko AI',
          guestIP: '',
          guestUA: '',
        },
        include: commentWebhookInclude,
      });
      sendCommentWebhook('comment.created', comment, {});
      await CreateNotification({
        accountId: note.accountId ?? 0,
        title: 'comment-notification',
        content: 'comment-notification',
        type: NotificationType.COMMENT,
      });
      return comment;
    } catch (error) {
      console.log(error);
      throw new Error(error);
    }
  }

  static postProcessNote = postProcessNote;

  /**
   * Transcribe audio file to text
   * @param filePath Audio file path
   * @param voiceModelId Voice model ID
   * @param accountId User account ID
   * @returns Transcribed text content
   */
  static async transcribeAudio({
    filePath,
    voiceModelId,
    accountId
  }: {
    filePath: string;
    voiceModelId: number;
    accountId: number;
  }): Promise<string> {
    try {
      // Get voice model configuration
      const voiceModel = await prisma.aiModels.findUnique({
        where: { id: voiceModelId },
        include: { provider: true },
      });

      if (!voiceModel || !(voiceModel.capabilities as any)?.audio) {
        throw new Error('Voice model not found or does not support audio');
      }

      // Get audio provider
      const { audioModel } = await AiModelFactory.GetProvider();
      // Read audio file
      const fs = await import('fs');
      if (!fs.existsSync(filePath)) {
        throw new Error(`Audio file not found: ${filePath}`);
      }

      // Get file extension to determine audio format
      const path = await import('path');
      const fileExtension = path.extname(filePath).toLowerCase().substring(1);
      // Create audio stream
      const audioStream = fs.createReadStream(filePath);
      // Execute speech to text, 
      // {
      //   filetype: fileExtension || 'mp3',
      // }
      const transcription = await audioModel?.listen(audioStream,
        {
          filetype: fileExtension || 'mp3',
        }
      );

      console.log(`Audio transcription completed for file: ${filePath},${transcription}`);
      return transcription?.toString() || '';
    } catch (error) {
      console.error('Error transcribing audio:', error);
      throw new Error(`Audio transcription failed: ${error.message}`);
    }
  }

  /**
   * Process audio attachments for transcription
   * @param attachments Array of attachments to process
   * @param voiceModelId Voice model ID
   * @param accountId User account ID
   * @returns Transcription results
   */
  static async processNoteAudioAttachments({
    attachments,
    voiceModelId,
    accountId
  }: {
    attachments: Array<{ name: string; path: string; type?: string }>;
    voiceModelId: number;
    accountId: number;
  }): Promise<{ success: boolean; transcriptions: Array<{ fileName: string; transcription: string }> }> {
    try {
      const audioAttachments = attachments.filter(attachment =>
        this.isAudio(attachment.name || attachment.path)
      );

      if (audioAttachments.length === 0) {
        return { success: true, transcriptions: [] };
      }

      const transcriptions: any = [];

      for (const attachment of audioAttachments) {
        let cleanup: (() => Promise<void>) | undefined;
        try {
          // Use FileService to get file path (handles both local and S3 storage)
          const fileResult = await FileService.getFile(attachment.path);
          cleanup = fileResult.cleanup;

          const transcription = await this.transcribeAudio({
            filePath: fileResult.path,
            voiceModelId,
            accountId,
          });

          transcriptions.push({
            fileName: attachment.name || attachment.path,
            transcription,
          });

          console.log(`Transcribed audio: ${attachment.name}`);
        } catch (error) {
          console.error(`Failed to transcribe audio ${attachment.name}:`, error);
        } finally {
          // Clean up temporary file if using S3 storage
          if (cleanup) {
            try {
              await cleanup();
            } catch (cleanupError) {
              console.error(`Failed to cleanup temporary file for ${attachment.name}:`, cleanupError);
            }
          }
        }
      }

      return { success: true, transcriptions };
    } catch (error) {
      console.error('Error processing note audio attachments:', error);
      return { success: false, transcriptions: [] };
    }
  }
}
