import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import type { LibSQLVector } from '@mastra/libsql';
import type { Prisma } from '@prisma/client';

let noteQuery: Prisma.notesFindManyArgs | undefined;
// The unit test inspects the actual ORM boundary; it deliberately does not
// implement an in-memory copy of Prisma's lifecycle/owner filtering.
const selectedRows = [{ id: 7, content: 'database-selected note' }, { id: 2, content: 'second note' }];
mock.module('@server/prisma', () => ({
  prisma: { notes: { findMany: async (args: Prisma.notesFindManyArgs) => { noteQuery = args; return selectedRows; } } },
}));
const { queryVectorNotes } = await import('../../vectorQuery');

let vectorQuery: unknown;
const vectorStore = {
  query: async (args: unknown) => {
    vectorQuery = args;
    return [
      { score: 0.9, metadata: { id: '2' } },
      { score: 0.8, metadata: { id: 7 } },
      { score: 0.7, metadata: { id: 7 } },
      { score: 0.1, metadata: { id: 99 } },
    ];
  },
} as unknown as LibSQLVector;
const embeddings: EmbeddingModelV4 = {
  specificationVersion: 'v4', provider: 'local', modelId: 'test',
  maxEmbeddingsPerCall: 1, supportsParallelCalls: false,
  doEmbed: async ({ values }) => {
    expect(values).toEqual(['marker']);
    return { embeddings: [[1, 0, 0]], warnings: [] };
  },
};
const options = { query: 'marker', accountId: 42, vectorStore, embeddings, topK: 4, embeddingMinScore: 0.4 };

beforeEach(() => { noteQuery = undefined; vectorQuery = undefined; });

describe('RAG note retrieval lifecycle boundary', () => {
  it.each([undefined, {}, { isRecycle: false }, { isRecycle: true }])('maps filter %j to the real Prisma query', async (filter) => {
    await queryVectorNotes({ ...options, filter });
    expect(noteQuery?.where).toEqual({ accountId: 42, isRecycle: filter?.isRecycle ?? false, id: { in: [2, 7] } });
    expect(vectorQuery).toEqual({ indexName: 'blinko', queryVector: [1, 0, 0], topK: 4 });
  });

  it('constructs response and AI context only from loaded rows, preserving DB order and first matching score', async () => {
    const result = await queryVectorNotes(options);
    expect(result.notes.map(note => [note.id, note.score])).toEqual([[7, 0.8], [2, 0.9]]);
    expect(result.aiContext).toEqual(['database-selected note\n', 'second note\n']);
    expect(noteQuery).not.toHaveProperty('orderBy');
    expect(noteQuery).not.toHaveProperty('skip');
    expect(noteQuery).not.toHaveProperty('take');
    expect(noteQuery?.include?.attachments).toEqual({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
    expect(noteQuery?.include).toMatchObject({ tags: { include: { tag: true } }, _count: { select: { comments: true, histories: true } } });
  });
});
