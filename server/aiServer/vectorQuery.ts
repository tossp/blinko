import type { EmbeddingModelV4 } from '@ai-sdk/provider';
import type { LibSQLVector } from '@mastra/libsql';
import { embed } from 'ai';
import { prisma } from '@server/prisma';
import { _ } from '@shared/lib/lodash';

// Internal retrieval option, not a new public API parameter. Other RAG callers
// omit it and exclude recycled notes by default.
export type VectorNoteFilter = { isRecycle?: boolean };

type VectorQueryOptions = {
  query: string;
  accountId: number;
  vectorStore: LibSQLVector;
  embeddings: EmbeddingModelV4;
  topK: number;
  embeddingMinScore: number;
  filter?: VectorNoteFilter;
};

export async function queryVectorNotes({ query, accountId, vectorStore, embeddings, topK, embeddingMinScore, filter }: VectorQueryOptions) {
  const { embedding } = await embed({ value: query, model: embeddings });
  const result = await vectorStore.query({ indexName: 'blinko', queryVector: embedding, topK });
  const filteredResults = result.filter(({ score }) => score >= embeddingMinScore);

  const notes = (
    await prisma.notes.findMany({
      where: {
        accountId,
        // Apply lifecycle filtering when loading authoritative note records,
        // before either the search response or the AI context is constructed.
        isRecycle: filter?.isRecycle ?? false,
        id: {
          in: _.uniqWith(filteredResults.map((i) => Number(i.metadata?.id))).filter((i) => !!i) as number[],
        },
      },
      include: {
        tags: { include: { tag: true } },
        attachments: {
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        },
        references: {
          select: {
            toNoteId: true,
            toNote: {
              select: {
                content: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        referencedBy: {
          select: {
            fromNoteId: true,
            fromNote: {
              select: {
                content: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        _count: {
          select: {
            comments: true,
            histories: true,
          },
        },
      },
    })
  ).map((note) => ({ ...note, score: filteredResults.find((result) => Number(result.metadata?.id) == note.id)?.score ?? 0 }));

  return { notes, aiContext: notes.map((note) => note.content + '\n') };
}
