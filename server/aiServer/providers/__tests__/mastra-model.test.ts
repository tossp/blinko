import { expect, it } from 'bun:test';
import type { LanguageModelV4, LanguageModelV4StreamPart, LanguageModelV4Usage } from '@ai-sdk/provider';
import { Agent } from '@mastra/core/agent';
import { toMastraModel } from '../mastraModel';
import { toLegacyAiStream } from '../../streamProtocol';

const usage: LanguageModelV4Usage = {
  inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};

class LocalModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider = 'local-test';
  readonly modelId = 'local';
  get supportedUrls() { return {}; }
  async doGenerate() {
    return { content: [{ type: 'text' as const, text: this.modelId }], finishReason: { unified: 'stop' as const, raw: 'stop' }, usage, warnings: [] };
  }
  async doStream() {
    const parts: LanguageModelV4StreamPart[] = [
      { type: 'stream-start', warnings: [] },
      { type: 'ping' },
      { type: 'text-start', id: 'text-1' },
      { type: 'text-delta', id: 'text-1', delta: this.modelId },
      { type: 'ping' },
      { type: 'text-end', id: 'text-1' },
      { type: 'finish', finishReason: { unified: 'stop', raw: 'stop' }, usage },
    ];
    return { stream: new ReadableStream<LanguageModelV4StreamPart>({ start(controller) { parts.forEach(part => controller.enqueue(part)); controller.close(); } }) };
  }
}

it('adapts provider 4.0.37 ping events to Mastra 1.82 without losing prototype methods or generated text', async () => {
  const raw = new LocalModel();
  const adapted = toMastraModel(raw);
  expect(await adapted.doGenerate({ prompt: [] })).toEqual(await raw.doGenerate());
  const stream = await adapted.doStream({ prompt: [] });
  const parts: string[] = [];
  for await (const part of stream.stream) parts.push(part.type);
  expect(parts).toEqual(['stream-start', 'text-start', 'text-delta', 'text-end', 'finish']);

  const agent = new Agent({ id: 'ping-test', name: 'Ping test', instructions: 'Reply', model: adapted });
  expect((await agent.generate('test')).text).toBe('local');
  const result = await agent.stream('test');
  let text = '';
  for await (const chunk of toLegacyAiStream(result.fullStream)) {
    if (chunk.type === 'text-delta') text += chunk.textDelta;
    if (chunk.type === 'finish') expect(chunk.usage).toEqual({ promptTokens: 2, completionTokens: 1, totalTokens: 3 });
  }
  expect(text).toBe('local');
});

it('forwards cancellation, abort options and response metadata across the ping filter', async () => {
  let seenSignal: AbortSignal | undefined;
  let cancellation: unknown;
  let confirmCancellation!: () => void;
  const wasCancelled = new Promise<void>(resolve => { confirmCancellation = resolve; });
  const raw: LanguageModelV4 = {
    specificationVersion: 'v4', provider: 'local-test', modelId: 'local', supportedUrls: {},
    doGenerate: () => new LocalModel().doGenerate(),
    doStream: async (options) => {
      seenSignal = options.abortSignal;
      return {
        request: { body: 'local request', url: 'http://mock.invalid' },
        response: { headers: { 'x-local': 'ok' } },
        stream: new ReadableStream<LanguageModelV4StreamPart>({
          start(controller) { controller.enqueue({ type: 'ping' }); },
          cancel(reason) { cancellation = reason; confirmCancellation(); },
        }),
      };
    },
  };
  const controller = new AbortController();
  const result = await toMastraModel(raw).doStream({ prompt: [], abortSignal: controller.signal });
  expect(seenSignal).toBe(controller.signal);
  const expectedRequest = { body: 'local request', url: 'http://mock.invalid' };
  expect(result.request).toEqual(expectedRequest);
  expect(result.response).toEqual({ headers: { 'x-local': 'ok' } });
  await result.stream.cancel('local cancellation');
  await wasCancelled;
  expect(cancellation).toBe('local cancellation');
});
