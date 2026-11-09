import { describe, expect, it, mock } from 'bun:test';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { createTool } from '@mastra/core/tools';
import { generateText, embed } from 'ai';
import { Readable } from 'node:stream';
import { z } from 'zod/v3';
import { toLegacyAiStream } from '../../streamProtocol';
import { toMastraModel } from '../mastraModel';

// Only replace transport/proxy discovery: provider and Mastra implementations
// stay real. No request may leave this process, even on an unexpected URL.
let transport: (...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>;
mock.module('@server/lib/proxy', () => ({ fetchWithProxy: async () => transport }));
const { LLMProvider } = await import('../LLMProvider');
const { EmbeddingProvider } = await import('../EmbeddingProvider');
const { AudioProvider } = await import('../AudioProvider');

const json = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { 'Content-Type': 'application/json' },
});

function chatResponse(stream: boolean, toolCall = false) {
  const message = toolCall
    ? { role: 'assistant', content: null, tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'record', arguments: '{"value":"hello"}' } }] }
    : { role: 'assistant', content: 'hello' };
  const usage = { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 };
  if (!stream) return json({ id: 'chat-1', object: 'chat.completion', created: 1, model: 'test', choices: [{ index: 0, message, finish_reason: toolCall ? 'tool_calls' : 'stop' }], usage });
  const delta = toolCall
    ? { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name: 'record', arguments: '{"value":"hello"}' } }] }
    : { content: 'hello' };
  const events = [
    { id: 'chat-1', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta, finish_reason: null }] },
    { id: 'chat-1', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta: {}, finish_reason: toolCall ? 'tool_calls' : 'stop' }], usage },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n', {
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

describe('AI SDK 7 real providers with local mock transport', () => {
  it('preserves Chat Completions for OpenAI-compatible providers instead of switching to Responses', async () => {
    const urls: string[] = [];
    transport = async (input, init) => {
      urls.push(String(input));
      const body = JSON.parse(String(init?.body));
      expect(body.messages[0].content).toBe('test');
      return chatResponse(Boolean(body.stream));
    };
    for (const provider of ['openai', 'minimax', 'litellm', 'custom', 'azure']) {
      const model = await new LLMProvider().getLanguageModel({ provider, apiKey: 'local-test', baseURL: 'http://mock.invalid/v1', modelKey: 'test' });
      expect(model.specificationVersion).toBe('v4');
      expect((await generateText({ model, prompt: 'test', maxRetries: 0 })).text).toBe('hello');
    }
    expect(urls).toHaveLength(5);
    expect(urls.every(url => url.includes('/chat/completions') && !url.includes('/responses'))).toBe(true);
  });

  it('runs Mastra tool input + authenticated request context and retains legacy streaming fields', async () => {
    let calls = 0;
    let seenAccount: unknown;
    transport = async (_input, init) => chatResponse(true, calls++ === 0);
    const record = createTool({
      id: 'record', description: 'Record a value', inputSchema: z.object({ value: z.string() }),
      execute: async (input, { requestContext }) => {
        seenAccount = requestContext.get('accountId');
        return { saved: input.value };
      },
    });
    const model = await new LLMProvider().getLanguageModel({ provider: 'custom', apiKey: 'local-test', baseURL: 'http://mock.invalid/v1', modelKey: 'test' });
    const agent = new Agent({ id: 'transport-test', name: 'Transport test', instructions: 'Use record', model: toMastraModel(model), tools: { record } });
    const requestContext = new RequestContext();
    requestContext.set('accountId', 42);
    const output = await agent.stream('record hello', { requestContext });
    const chunks: Array<NonNullable<ReturnType<typeof import("../../streamProtocol").toLegacyAiChunk>>> = [];
    for await (const chunk of toLegacyAiStream(output.fullStream)) chunks.push(chunk);
    expect(seenAccount).toBe(42);
    expect(calls).toBe(2);
    expect(chunks.find(chunk => chunk.type === 'tool-call-streaming-start')).toMatchObject({ toolName: 'record', toolCallId: 'call-1' });
    expect(chunks.find(chunk => chunk.type === 'tool-call-delta')).toMatchObject({ argsTextDelta: '{"value":"hello"}' });
    expect(chunks.find(chunk => chunk.type === 'tool-call')).toMatchObject({ toolName: 'record', args: { value: 'hello' } });
    expect(chunks.find(chunk => chunk.type === 'tool-result')).toMatchObject({ toolName: 'record', result: { saved: 'hello' } });
    expect(chunks.find(chunk => chunk.type === 'text-delta')).toMatchObject({ textDelta: 'hello' });
    expect(chunks.filter(chunk => chunk.type === 'step-finish')).toHaveLength(2);
    expect(chunks.filter(chunk => chunk.type === 'finish')).toHaveLength(1);
    expect(chunks.find(chunk => chunk.type === 'finish')).toMatchObject({ finishReason: 'stop', usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 } });
    expect(chunks.every(chunk => !('payload' in chunk))).toBe(true);
  });

  it.each(['http', 'sse', 'sse-after-text'])('exposes %s provider failures through the legacy error protocol', async (mode) => {
    transport = async () => {
      const error = { message: 'local denied', type: 'invalid_request_error', code: 'invalid_api_key', param: null };
      const prefix = mode === 'sse-after-text' ? `data: ${JSON.stringify({ id: 'partial', object: 'chat.completion.chunk', created: 1, model: 'test', choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }] })}\n\n` : '';
      return mode === 'http'
        ? new Response(JSON.stringify({ error }), { status: 401, headers: { 'Content-Type': 'application/json' } })
        : new Response(`${prefix}data: ${JSON.stringify({ error })}\n\ndata: [DONE]\n\n`, { headers: { 'Content-Type': 'text/event-stream' } });
    };
    const model = await new LLMProvider().getLanguageModel({ provider: 'custom', apiKey: 'local-test', baseURL: 'http://mock.invalid/v1', modelKey: 'test' });
    const agent = new Agent({ id: `error-${mode}`, name: 'Error test', instructions: 'Reply', model: toMastraModel(model) });
    const output = await agent.stream('test', { modelSettings: { maxRetries: 0 } });
    const chunks: Array<NonNullable<ReturnType<typeof import('../../streamProtocol').toLegacyAiChunk>>> = [];
    for await (const chunk of toLegacyAiStream(output.fullStream)) chunks.push(chunk);
    expect(chunks.find(chunk => chunk.type === 'error')).toMatchObject({ error: { message: 'local denied' } });
    expect(chunks.some(chunk => chunk.type === 'finish' && chunk.finishReason === 'stop')).toBe(false);
    if (mode === 'sse-after-text') expect(chunks.find(chunk => chunk.type === 'text-delta')).toMatchObject({ textDelta: 'partial' });
  });

  it('retains tool failure visibility rather than reporting a successful tool result', async () => {
    let calls = 0;
    transport = async () => chatResponse(true, calls++ === 0);
    const record = createTool({
      id: 'record', description: 'Record a value', inputSchema: z.object({ value: z.string() }),
      execute: async () => { throw new Error('local tool denied'); },
    });
    const model = await new LLMProvider().getLanguageModel({ provider: 'custom', apiKey: 'local-test', baseURL: 'http://mock.invalid/v1', modelKey: 'test' });
    const agent = new Agent({ id: 'tool-error', name: 'Tool error test', instructions: 'Use record', model: toMastraModel(model), tools: { record } });
    const output = await agent.stream('record hello', { modelSettings: { maxRetries: 0 } });
    const chunks: Array<NonNullable<ReturnType<typeof import('../../streamProtocol').toLegacyAiChunk>>> = [];
    for await (const chunk of toLegacyAiStream(output.fullStream)) chunks.push(chunk);
    expect(chunks.find(chunk => chunk.type === 'tool-call')).toMatchObject({ toolName: 'record' });
    expect(chunks.find(chunk => chunk.type === 'error')).toMatchObject({ error: { message: 'local tool denied' } });
    expect(chunks.some(chunk => chunk.type === 'tool-result' && !chunk.isError)).toBe(false);
  });

  it('generates using Mastra and modelSettings on the v4 model', async () => {
    transport = async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      expect(body.temperature).toBe(0.3);
      return chatResponse(Boolean(body.stream));
    };
    const model = await new LLMProvider().getLanguageModel({ provider: 'custom', apiKey: 'local-test', baseURL: 'http://mock.invalid/v1', modelKey: 'gpt-4o' });
    const agent = new Agent({ id: 'generate-test', name: 'Generate test', instructions: 'Reply', model: toMastraModel(model) });
    expect((await agent.generate('test', { modelSettings: { temperature: 0.3 } })).text).toBe('hello');
  });

  it('uses SDK 7 embedding models for OpenAI, Voyage and Ollama', async () => {
    for (const provider of ['openai', 'voyageai', 'ollama']) {
      transport = async (input) => {
        if (String(input).includes('/embed')) {
          return provider === 'ollama'
            ? json({ model: 'test', embeddings: [[0.1, 0.2]], prompt_eval_count: 2, total_duration: 0, load_duration: 0 })
            : json({ object: 'list', model: 'test', data: [{ object: 'embedding', index: 0, embedding: [0.1, 0.2] }], usage: { total_tokens: 2, prompt_tokens: 2 } });
        }
        throw new Error(`Unexpected embedding request: ${input}`);
      };
      const model = await new EmbeddingProvider().getEmbeddingModel({ provider, apiKey: 'local-test', baseURL: 'http://mock.invalid/api', modelKey: 'test' });
      expect(model?.specificationVersion).toBe('v4');
      expect((await embed({ model: model!, value: 'hello', maxRetries: 0 })).embedding).toEqual([0.1, 0.2]);
    }
  });

  it('configures the voice provider-owned client with the custom URL and transport', async () => {
    let called = false;
    transport = async (input) => {
      expect(String(input)).toBe('http://mock.invalid/v1/audio/transcriptions');
      called = true;
      return json({ text: 'local audio' });
    };
    const voice = await new AudioProvider().getAudioModel({ provider: 'custom', apiKey: 'local-test', baseURL: 'http://mock.invalid/v1', modelKey: 'whisper-1' });
    expect(await voice?.listen(Readable.from([Buffer.from('audio')]), { filetype: 'wav' })).toBe('local audio');
    expect(called).toBe(true);
  });
});
