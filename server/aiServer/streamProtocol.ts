import type { ChunkType, LanguageModelUsage } from '@mastra/core/stream';

type Payload<T extends ChunkType['type']> = Extract<ChunkType, { type: T; payload: unknown }>['payload'];
type ForwardedType = 'reasoning-signature' | 'redacted-reasoning' | 'tool-call' | 'tool-result' | 'tool-call-delta' | 'step-start';
type ForwardedChunk = { [T in ForwardedType]: { type: T } & Payload<T> }[ForwardedType];

export interface LegacyAiUsage {
  promptTokens: LanguageModelUsage['inputTokens'];
  completionTokens: LanguageModelUsage['outputTokens'];
  totalTokens: LanguageModelUsage['totalTokens'];
}

// Name the wire union before tRPC infers it: inferred object unions expand Mastra's
// private SDK v1/v2 metadata. Indexed public payload types preserve every field.
export type LegacyAiChunk =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'reasoning'; textDelta: string }
  | ForwardedChunk
  | { type: 'source'; source: Payload<'source'> }
  | { type: 'file'; mimeType: string; base64: string; uint8Array: Uint8Array }
  | ({ type: 'tool-call-streaming-start' } & Payload<'tool-call-input-streaming-start'>)
  | {
    type: 'step-finish';
    messageId: Payload<'step-finish'>['messageId'];
    request: Payload<'step-finish'>['metadata']['request'];
    response: Payload<'step-finish'>['response'];
    warnings: Payload<'step-finish'>['stepResult']['warnings'];
    usage: LegacyAiUsage;
    finishReason: Payload<'step-finish'>['stepResult']['reason'];
    isContinued: Payload<'step-finish'>['stepResult']['isContinued'];
    logprobs: Payload<'step-finish'>['stepResult']['logprobs'];
    providerMetadata: Payload<'step-finish'>['metadata']['providerMetadata'];
  }
  | {
    type: 'finish';
    finishReason: Payload<'finish'>['stepResult']['reason'];
    usage: LegacyAiUsage;
    providerMetadata: Payload<'finish'>['providerMetadata'];
    response: Payload<'finish'>['response'];
    logprobs: Payload<'finish'>['stepResult']['logprobs'];
  }
  | { type: 'error'; error: unknown };

function legacyUsage(usage: LanguageModelUsage): LegacyAiUsage {
  return { promptTokens: usage.inputTokens, completionTokens: usage.outputTokens, totalTokens: usage.totalTokens };
}

/** Keep the AI SDK 4 tRPC chat/writing wire format while Mastra uses payloads. */
export function toLegacyAiChunk(chunk: ChunkType): LegacyAiChunk | null {
  switch (chunk.type) {
    case 'text-delta':
      return { type: chunk.type, textDelta: chunk.payload.text };
    case 'reasoning-delta':
      return { type: 'reasoning' as const, textDelta: chunk.payload.text };
    case 'reasoning-signature':
      return { type: chunk.type, ...chunk.payload };
    case 'redacted-reasoning':
      return { type: chunk.type, ...chunk.payload };
    case 'source':
      return { type: chunk.type, source: chunk.payload };
    case 'file': {
      const data = chunk.payload.data;
      const bytes = typeof data === 'string' ? Buffer.from(data, 'base64') : data;
      return { type: chunk.type, mimeType: chunk.payload.mimeType, base64: chunk.payload.base64 ?? Buffer.from(bytes).toString('base64'), uint8Array: bytes };
    }
    case 'tool-call':
      return { type: chunk.type, ...chunk.payload };
    case 'tool-result':
      return { type: chunk.type, ...chunk.payload };
    case 'tool-call-input-streaming-start':
      return { type: 'tool-call-streaming-start' as const, ...chunk.payload };
    case 'tool-call-delta':
      return { type: chunk.type, ...chunk.payload };
    case 'step-start':
      return { type: chunk.type, ...chunk.payload };
    case 'step-finish':
      return {
        type: chunk.type,
        messageId: chunk.payload.messageId,
        request: chunk.payload.metadata.request,
        response: chunk.payload.response,
        warnings: chunk.payload.stepResult.warnings,
        usage: legacyUsage(chunk.payload.output.usage),
        finishReason: chunk.payload.stepResult.reason,
        isContinued: chunk.payload.stepResult.isContinued,
        logprobs: chunk.payload.stepResult.logprobs,
        providerMetadata: chunk.payload.metadata.providerMetadata,
      };
    case 'finish':
      return {
        type: chunk.type,
        finishReason: chunk.payload.stepResult.reason,
        usage: legacyUsage(chunk.payload.output.usage),
        providerMetadata: chunk.payload.providerMetadata ?? chunk.payload.metadata.providerMetadata,
        response: chunk.payload.response,
        logprobs: chunk.payload.stepResult.logprobs,
      };
    case 'error':
    case 'tool-error': {
      const error = chunk.payload.error;
      return {
        type: 'error' as const,
        error: error instanceof Error ? { name: error.name, message: error.message } : error,
      };
    }
    default:
      // Internal Mastra framing has no legacy counterpart (e.g. text-start/end).
      return null;
  }
}

export async function* toLegacyAiStream(stream: AsyncIterable<ChunkType>): AsyncGenerator<LegacyAiChunk, void, unknown> {
  for await (const chunk of stream) {
    const legacy = toLegacyAiChunk(chunk);
    if (legacy) yield legacy;
  }
}
