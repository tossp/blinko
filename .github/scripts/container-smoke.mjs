import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as zlib from 'node:zlib';
import sharp from 'sharp';
import sqlite3 from 'sqlite3';
import { createClient } from '@libsql/client';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { LibSQLVector } from '@mastra/libsql';

// Run through stdin inside the final image, without networking or a database.
assert.equal(process.version, 'v26.13.0');
assert.equal(zlib.constants.BROTLI_DECODER_ERROR_FORMAT_BLOCK_SWITCH, -17);
for (const input of [Buffer.alloc(0), Buffer.from('Blinko runtime verification'), Buffer.alloc(65536, 0x61)]) {
  assert.deepEqual(zlib.brotliDecompressSync(zlib.brotliCompressSync(input)), input);
}

const png = await sharp({
  create: { width: 2, height: 2, channels: 4, background: '#123456' },
}).png().toBuffer();
assert.equal((await sharp(png).metadata()).width, 2);

const database = new sqlite3.Database(':memory:');
const row = await new Promise((resolve, reject) => {
  database.get('SELECT 1 AS value', (error, result) => error ? reject(error) : resolve(result));
});
assert.equal(row.value, 1);
await new Promise((resolve, reject) => database.close(error => error ? reject(error) : resolve()));

const vectors = createClient({ url: 'file::memory:' });
try {
  assert.equal((await vectors.execute('SELECT 1 AS value')).rows[0].value, 1);
} finally {
  vectors.close();
}

const vectorIndex = new LibSQLVector({ id: 'container-smoke', url: 'file::memory:' });
try {
  await vectorIndex.createIndex({ indexName: 'smoke', dimension: 3, metric: 'cosine' });
  await vectorIndex.upsert({ indexName: 'smoke', vectors: [[1, 0, 0]], metadata: [{ id: 42 }] });
  assert.equal((await vectorIndex.query({ indexName: 'smoke', queryVector: [1, 0, 0], topK: 1 }))[0].metadata.id, 42);
} finally {
  await vectorIndex.close();
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: 'postgresql://smoke:smoke@127.0.0.1:1/smoke' }),
});
await prisma.$disconnect();

for (const name of ['ai', '@mastra/core/agent', '@mastra/libsql', 'pdf-parse', 'ollama-ai-provider-v2']) {
  await import(name);
}
const Twitter = (await import('passport-twitter')).default;
const twitter = new Twitter({ consumerKey: 'smoke', consumerSecret: 'smoke' }, () => {});
assert.equal(twitter.parseErrorResponse('<hash><error>Unavailable</error></hash>', 503).message, 'Unavailable');

assert.ok(readFileSync('server/public/index.html', 'utf8').includes('<html'));
console.log(JSON.stringify({ node: process.version, brotli: process.versions.brotli, arch: process.arch, smoke: 'passed' }));
