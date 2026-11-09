import { BaseProvider } from './BaseProvider';
import { OpenAIVoice } from '@mastra/voice-openai';

interface AudioConfig {
  provider: string;
  apiKey?: string | null;
  baseURL?: string | null;
  modelKey: string;
  apiVersion?: string;
  speaker?: string;
  speed?: number;
}

export class AudioProvider extends BaseProvider {
  async getAudioModel(config: AudioConfig): Promise<OpenAIVoice | null> {
    await this.initializeFetch();
    if (!config.apiKey || ['azureopenai', 'azure'].includes(config.provider.toLowerCase())) {
      return null;
    }

    // Configure the provider-owned OpenAI client instead of assigning a client
    // from our (potentially different major) direct openai dependency.
    const options = {
      baseURL: config.baseURL || undefined,
      fetch: this.proxiedFetch,
    };
    return new OpenAIVoice({
      speechModel: { apiKey: config.apiKey, options },
      listeningModel: {
        name: (config.modelKey || 'whisper-1') as 'whisper-1',
        apiKey: config.apiKey,
        options,
      },
    });
  }
}
