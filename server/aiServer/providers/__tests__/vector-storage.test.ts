import { expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LibSQLVector } from '@mastra/libsql';
import { MDocument } from '@mastra/rag';
import { deleteVectorRecord } from '../../vectorRecords';

it('chunks Markdown and exercises LibSQL 1 index/upsert/query/deletion in temporary storage', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blinko-vector-'));
  const url = `file:${join(directory, 'vectors.db')}`;
  const store = new LibSQLVector({ id: 'local-regression', url });
  try {
    const chunks = await MDocument.fromMarkdown('# Local\n\nA regression note.').chunk();
    expect(chunks.length).toBeGreaterThan(0);
    await store.createIndex({ indexName: 'blinko', dimension: 3, metric: 'cosine' });
    await store.upsert({ indexName: 'blinko', vectors: [[1, 0, 0], [0, 1, 0]], metadata: [
      { id: 42, text: chunks[0].text }, { id: 7, text: 'other note' },
    ] });
    const results = await store.query({ indexName: 'blinko', queryVector: [1, 0, 0], topK: 2 });
    expect(results[0].metadata?.id).toBe(42);
    expect((await deleteVectorRecord(42, url)).success).toBe(true);
    const remaining = await store.query({ indexName: 'blinko', queryVector: [1, 0, 0], topK: 2 });
    expect(remaining.map(result => result.metadata?.id)).toEqual([7]);
    expect((await deleteVectorRecord(42, url)).success).toBe(false);
  } finally {
    await store.close();
    await rm(directory, { recursive: true, force: true });
  }
});
