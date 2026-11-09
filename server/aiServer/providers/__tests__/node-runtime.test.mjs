import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpenAI } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { toMastraModel } from '../mastraModel.ts';
import { toLegacyAiStream } from '../../streamProtocol.ts';
import { loadFileContent } from '../../fileContent.ts';
import { pdfFixture, docxFixture } from './fixtures/attachments.ts';
import { _ } from '../../../../shared/lib/lodash.ts';
import dayjs from '../../../../shared/lib/dayjs.ts';

// Native Node execution: no bun:test, database, real network or paid endpoints.
test('Node runs the real SDK 7/Mastra generate + stream protocol over a local transport', async () => {
  const transport = async (url, init) => {
    assert.equal(String(url), 'http://mock.invalid/v1/chat/completions');
    const body = JSON.parse(init.body);
    const usage = { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 };
    if (!body.stream) return Response.json({ id: 'local', created: 1, model: 'gpt-4o', choices: [{ index: 0, message: { role: 'assistant', content: 'hello' }, finish_reason: 'stop' }], usage });
    const events = [
      { id: 'local', created: 1, model: 'gpt-4o', choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }] },
      { id: 'local', created: 1, model: 'gpt-4o', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }], usage },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
  };
  const raw = createOpenAI({ apiKey: 'local-test', baseURL: 'http://mock.invalid/v1', fetch: transport }).chat('gpt-4o');
  const agent = new Agent({ id: 'node-runtime', name: 'Node runtime', instructions: 'Reply', model: toMastraModel(raw) });
  assert.equal((await agent.generate('test')).text, 'hello');
  const result = await agent.stream('test');
  const chunks = [];
  for await (const chunk of toLegacyAiStream(result.fullStream)) chunks.push(chunk);
  assert.equal(chunks.find(chunk => chunk.type === 'text-delta').textDelta, 'hello');
  assert.deepEqual(chunks.find(chunk => chunk.type === 'finish').usage, { promptTokens: 2, completionTokens: 1, totalTokens: 3 });
});

test('Node extracts PDF, DOCX, TXT, CSV and the multipart fallback with real local parsers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'blinko-node-parsers-'));
  try {
    for (const [name, data, expected] of [
      ['note.pdf', pdfFixture(), 'Local PDF regression'],
      ['note.docx', docxFixture(), 'Local DOCX regression'],
      ['note.txt', '你好\ntext', '你好\ntext'],
      ['note.csv', 'title,body\nA,B', 'title: A\nbody: B'],
    ]) {
      const path = join(directory, name);
      await writeFile(path, data);
      assert.ok((await loadFileContent(path)).includes(expected), name);
    }
    const path = join(directory, 'note.rtf');
    await writeFile(path, '{\\rtf1 local}');
    assert.equal(await loadFileContent(path, async (_url, init) => {
      assert.equal(init.method, 'POST');
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('strategy'), 'hi_res');
      return Response.json([{ text: 'local fallback' }]);
    }), 'local fallback');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Node loads shared helpers with production-compatible ESM subpaths', () => {
  for (const helper of Object.values(_)) assert.equal(typeof helper, 'function');
  assert.equal(dayjs.utc('2026-11-09T00:00:00Z').tz('UTC').format('YYYY-MM-DD'), '2026-11-09');
  assert.equal(typeof dayjs().fromNow, 'function');
});
