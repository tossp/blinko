import type { LanguageModelV4, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import type { MastraModelConfig } from '@mastra/core/llm';

type MastraV4Model = Extract<MastraModelConfig, { specificationVersion: 'v4' }>;
type MastraStreamResult = Awaited<ReturnType<MastraV4Model['doStream']>>;
type MastraStreamPart = MastraStreamResult['stream'] extends ReadableStream<infer Part> ? Part : never;

/**
 * Mastra 1.82 bundles provider 4.0.35. Provider 4.0.37 adds transport-only ping
 * events. Drop those at this boundary, without downgrading or casting a model.
 */
export function toMastraModel(model: LanguageModelV4): MastraV4Model {
  return {
    specificationVersion: 'v4',
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: options => model.doGenerate(options),
    doStream: async options => {
      const result = await model.doStream(options);
      return {
        ...result,
        stream: result.stream.pipeThrough(new TransformStream<LanguageModelV4StreamPart, MastraStreamPart>({
          transform(part, controller) {
            if (part.type !== 'ping') controller.enqueue(part);
          },
        })),
      };
    },
  };
}
