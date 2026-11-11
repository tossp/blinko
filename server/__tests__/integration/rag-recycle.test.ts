import { expect, spyOn, test } from 'bun:test';
import { RequestContext } from '@mastra/core/request-context';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import { PrismaClient } from '@prisma/client';
import { LibSQLVector } from '@mastra/libsql';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPrismaAdapter } from '../../../prisma/connection';

// Run this file in its own Bun process against an already migrated, disposable
// database. Never fall back to DATABASE_URL or application credentials.
const databaseUrl = process.env.BLINKO_RAG_TEST_DATABASE_URL;

test.skipIf(!databaseUrl)('real Prisma + LibSQL RAG follows the same note through recycle and restore', async () => {
  const db = new PrismaClient({ adapter: createPrismaAdapter(databaseUrl) });
  const globals = globalThis as typeof globalThis & { prisma?: PrismaClient };
  const previousPrisma = globals.prisma;
  globals.prisma = db;
  const directory = await mkdtemp(join(tmpdir(), 'blinko-rag-recycle-'));
  const vectorStore = new LibSQLVector({ id: 'rag-recycle-regression', url: `file:${join(directory, 'vectors.db')}` });
  const accountIds: number[] = [];
  const restoreMocks: Array<() => void> = [];
  try {
    // Import the real production retrieval implementation after providing the
    // isolated Prisma singleton. No mock ORM or copied filtering implementation.
    const { queryVectorNotes } = await import('../../aiServer/vectorQuery');
    const owner = await db.accounts.create({ data: { name: `rag-owner-${crypto.randomUUID()}` } });
    const outsider = await db.accounts.create({ data: { name: `rag-other-${crypto.randomUUID()}` } });
    accountIds.push(owner.id, outsider.id);
    const marker = `rag-recycle-${crypto.randomUUID()}`;
    const note = await db.notes.create({ data: { accountId: owner.id, content: marker } });
    const other = await db.notes.create({ data: { accountId: outsider.id, content: 'other account secret' } });
    const lowScore = await db.notes.create({ data: { accountId: owner.id, content: 'below similarity threshold' } });
    const archived = await db.notes.create({ data: { accountId: owner.id, content: 'archived note, preexisting RAG behavior', isArchived: true, type: 1 } });
    await vectorStore.createIndex({ indexName: 'blinko', dimension: 3, metric: 'cosine' });
    await vectorStore.upsert({
      indexName: 'blinko',
      vectors: [[1, 0, 0], [1, 0, 0], [0, 1, 0], [1, 0, 0], [1, 0, 0]],
      metadata: [{ id: note.id }, { id: other.id }, { id: lowScore.id }, { id: archived.id }, { id: note.id }],
    });
    const embeddings: EmbeddingModelV4 = {
      specificationVersion: 'v4', provider: 'local-test', modelId: 'fixed-vector',
      maxEmbeddingsPerCall: 1, supportsParallelCalls: false,
      doEmbed: async ({ values }) => {
        expect(values).toEqual([marker]);
        return { embeddings: [[1, 0, 0]], warnings: [] };
      },
    };
    const options = { query: marker, accountId: owner.id, vectorStore, embeddings, topK: 10, embeddingMinScore: 0.4 };
    // Keep the actual MCP tool, tRPC route, service and factory retrieval path.
    // Only replace configured external providers with local embedding/vector I/O.
    const { AiModelFactory } = await import('../../aiServer/aiModelFactory');
    const { searchBlinkoTool } = await import('../../aiServer/tools/searchBlinko');
    const providerMock = spyOn(AiModelFactory, 'GetProvider').mockResolvedValue({
      VectorStore: vectorStore, Embeddings: embeddings,
    } as Awaited<ReturnType<typeof AiModelFactory.GetProvider>>);
    const configMock = spyOn(AiModelFactory, 'globalConfig').mockResolvedValue({
      embeddingTopK: 10, embeddingScore: 0.4,
    } as Awaited<ReturnType<typeof AiModelFactory.globalConfig>>);
    restoreMocks.push(() => providerMock.mockRestore(), () => configMock.mockRestore());
    const requestContext = new RequestContext();
    requestContext.set('accountId', String(owner.id));
    const search = async (isRecycle: boolean, isUseAiQuery = true) => {
      const parsed = await searchBlinkoTool.inputSchema!['~standard'].validate({ searchText: marker, isRecycle, isUseAiQuery });
      if (!('value' in parsed)) throw new Error('Test MCP search input was rejected');
      const result = await searchBlinkoTool.execute!(parsed.value, { requestContext } as any);
      expect(result).toMatchObject({ success: true });
      return (result as { notes: Array<{ id: number; isRecycle: boolean }> }).notes;
    };
    expect((await search(false)).some(item => item.id === note.id)).toBe(true);
    const initial = await queryVectorNotes(options);
    expect(initial.notes.map(item => item.id).sort((a, b) => a - b)).toEqual([note.id, archived.id].sort((a, b) => a - b));
    expect(initial.notes.find(item => item.id === note.id)?.score).toBeCloseTo(1);

    await db.notes.update({ where: { id: note.id }, data: { isRecycle: true } });
    expect(await search(false, false)).toEqual([]);
    expect((await search(false)).some(item => item.id === note.id)).toBe(false);
    expect(await search(true)).toEqual([expect.objectContaining({ id: note.id, isRecycle: true })]);
    for (const filter of [undefined, { isRecycle: false }]) {
      const result = await queryVectorNotes({ ...options, filter });
      expect(result.notes.map(item => item.id)).toEqual([archived.id]);
      expect(result.aiContext).toEqual([archived.content + '\n']);
      expect(result.aiContext.join('')).not.toContain(marker);
    }
    await db.notes.update({ where: { id: other.id }, data: { isRecycle: true } });
    const recycled = await queryVectorNotes({ ...options, filter: { isRecycle: true } });
    expect(recycled.notes.map(item => item.id)).toEqual([note.id]);
    expect(recycled.notes[0].isRecycle).toBe(true);
    expect(recycled.aiContext).toEqual([marker + '\n']);

    await db.notes.update({ where: { id: note.id }, data: { isRecycle: false } });
    expect((await search(false)).some(item => item.id === note.id)).toBe(true);
    expect(await search(true)).toEqual([]);
    expect((await queryVectorNotes(options)).notes.some(item => item.id === note.id)).toBe(true);
    expect((await queryVectorNotes({ ...options, filter: { isRecycle: true } })).notes).toEqual([]);
    // topK is still applied by the vector store before SQL lifecycle filtering.
    await db.notes.updateMany({ where: { accountId: owner.id }, data: { isRecycle: true } });
    expect(await queryVectorNotes(options)).toEqual({ notes: [], aiContext: [] });
    expect((await queryVectorNotes({ ...options, topK: 1 })).notes).toEqual([]);
  } finally {
    for (const restore of restoreMocks) restore();
    await vectorStore.close();
    await db.notes.deleteMany({ where: { accountId: { in: accountIds } } });
    await db.accounts.deleteMany({ where: { id: { in: accountIds } } });
    await db.$disconnect();
    globals.prisma = previousPrisma;
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
