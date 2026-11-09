import type { LanguageModelV4 } from '@ai-sdk/provider';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOllama } from 'ollama-ai-provider-v2';
import { createDeepSeek } from '@ai-sdk/deepseek';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { createXai } from '@ai-sdk/xai';
import { createAzure } from '@ai-sdk/azure';
import { BaseProvider } from './BaseProvider';

interface LLMConfig {
  provider: string;
  apiKey?: string | null;
  baseURL?: string | null;
  modelKey: string;
  apiVersion?: string;
}

export class LLMProvider extends BaseProvider {
  async getLanguageModel(config: LLMConfig): Promise<LanguageModelV4> {
    await this.ensureInitialized();
    switch (config.provider.toLowerCase()) {
      case 'openai':
        return createOpenAI({
          apiKey: config.apiKey ?? undefined,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).chat(config.modelKey);

      case 'anthropic':
        return createAnthropic({
          apiKey: config.apiKey ?? undefined,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'gemini':
      case 'google':
        return createGoogleGenerativeAI({
          apiKey: config.apiKey ?? undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'ollama':
        return createOllama({
          baseURL: config.baseURL?.trim().replace(/\/api\/?$/, '') ? config.baseURL.trim().replace(/\/api\/?$/, '') + '/api' : undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'deepseek':
        return createDeepSeek({
          apiKey: config.apiKey ?? undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'openrouter':
        return createOpenRouter({
          apiKey: config.apiKey ?? undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'grok':
      case 'xai':
        return createXai({
          apiKey: config.apiKey ?? undefined,
          fetch: this.proxiedFetch
        }).languageModel(config.modelKey);

      case 'azureopenai':
      case 'azure':
        return createAzure({
          apiKey: config.apiKey ?? undefined,
          baseURL: config.baseURL || undefined,
          apiVersion: config.apiVersion || undefined,
          fetch: this.proxiedFetch
        }).chat(config.modelKey);

      case 'minimax':
        return createOpenAI({
          apiKey: config.apiKey ?? undefined,
          baseURL: config.baseURL || 'https://api.minimax.io/v1',
          fetch: this.proxiedFetch
        }).chat(config.modelKey);

      case 'litellm':
        return createOpenAI({
          apiKey: config.apiKey ?? undefined,
          baseURL: config.baseURL || 'http://localhost:4000/v1',
          fetch: this.proxiedFetch
        }).chat(config.modelKey);

      case 'custom':
      default:
        return createOpenAI({
          apiKey: config.apiKey ?? undefined,
          baseURL: config.baseURL || undefined,
          fetch: this.proxiedFetch
        }).chat(config.modelKey);
    }
  }
}