import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as zlib from 'node:zlib';
import sharp from 'sharp';
import sqlite3 from 'sqlite3';
import Parser from 'tree-sitter';
import { PrismaClient } from '@prisma/client';

// Run through stdin inside the final image, without networking or a database.
assert.equal(process.version, 'v24.22.2');
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

assert.ok(new Parser());

const prisma = new PrismaClient();
await prisma.$disconnect();
assert.ok(readFileSync('server/public/index.html', 'utf8').includes('<html'));
console.log(JSON.stringify({ node: process.version, brotli: process.versions.brotli, arch: process.arch, smoke: 'passed' }));
