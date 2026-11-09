import OpenAI from '@lobehub/icons/es/OpenAI/components/Mono.js';
import Anthropic from '@lobehub/icons/es/Anthropic/components/Mono.js';
import Ollama from '@lobehub/icons/es/Ollama/components/Mono.js';
import OpenRouter from '@lobehub/icons/es/OpenRouter/components/Mono.js';
import Grok from '@lobehub/icons/es/Grok/components/Mono.js';
import BAAI from '@lobehub/icons/es/BAAI/components/Mono.js';
import Jina from '@lobehub/icons/es/Jina/components/Mono.js';
import LangChain from '@lobehub/icons/es/LangChain/components/Mono.js';
import LlamaIndex from '@lobehub/icons/es/LlamaIndex/components/Mono.js';
import MicrosoftColor from '@lobehub/icons/es/Microsoft/components/Color.js';
import GoogleColor from '@lobehub/icons/es/Google/components/Color.js';
import DeepSeekColor from '@lobehub/icons/es/DeepSeek/components/Color.js';
import SiliconCloudColor from '@lobehub/icons/es/SiliconCloud/components/Color.js';
import MetaColor from '@lobehub/icons/es/Meta/components/Color.js';
import QwenColor from '@lobehub/icons/es/Qwen/components/Color.js';
import VoyageColor from '@lobehub/icons/es/Voyage/components/Color.js';
import CohereColor from '@lobehub/icons/es/Cohere/components/Color.js';
import HuggingFaceColor from '@lobehub/icons/es/HuggingFace/components/Color.js';
import MistralColor from '@lobehub/icons/es/Mistral/components/Color.js';
import PerplexityColor from '@lobehub/icons/es/Perplexity/components/Color.js';
import TogetherColor from '@lobehub/icons/es/Together/components/Color.js';
import AlibabaColor from '@lobehub/icons/es/Alibaba/components/Color.js';
import { Icon } from '@/components/Common/Iconify/icons';

// Provider Icon Component
interface ProviderIconProps {
  provider: string;
  className?: string;
}

const PROVIDER_ICONS: Record<string, React.ComponentType<any>> = {
  openai: OpenAI,
  anthropic: Anthropic,
  azure: MicrosoftColor,
  azureopenai: MicrosoftColor,
  google: GoogleColor,
  gemini: GoogleColor,
  ollama: Ollama,
  openrouter: OpenRouter,
  deepseek: DeepSeekColor,
  grok: Grok,
  xai: Grok,
  siliconflow: SiliconCloudColor,
  voyageai: VoyageColor,
  voyage: VoyageColor,
  litellm: OpenRouter,
  custom: OpenAI,
};

export function ProviderIcon({ provider, className = 'w-6 h-6' }: ProviderIconProps) {
  const normalizedProvider = provider.toLowerCase();
  const IconComponent = PROVIDER_ICONS[normalizedProvider] || PROVIDER_ICONS.custom;

  return <IconComponent className={className} />;
}

// Model Icon Component
interface ModelIconProps {
  modelName: string;
  className?: string;
}

const MODEL_ICON_MAP: Array<{
  keywords: string[];
  icon: React.ComponentType<any>;
}> = [
  // OpenAI models
  {
    keywords: ['gpt', 'openai', 'text-davinci', 'text-embedding'],
    icon: OpenAI,
  },
  // Anthropic models
  {
    keywords: ['claude', 'anthropic'],
    icon: Anthropic,
  },
  // Google models
  {
    keywords: ['gemini', 'google', 'bison', 'palm'],
    icon: GoogleColor,
  },
  // Meta models
  {
    keywords: ['llama', 'meta', 'code-llama'],
    icon: MetaColor,
  },
  // Microsoft models
  {
    keywords: ['azure', 'microsoft'],
    icon: MicrosoftColor,
  },
  // Qwen models
  {
    keywords: ['qwen', 'tongyi'],
    icon: QwenColor,
  },
  // DeepSeek models
  {
    keywords: ['deepseek'],
    icon: DeepSeekColor,
  },
  // Grok models
  {
    keywords: ['grok', 'xai'],
    icon: Grok,
  },
  // Ollama models
  {
    keywords: ['ollama'],
    icon: Ollama,
  },
  // OpenRouter models
  {
    keywords: ['openrouter'],
    icon: OpenRouter,
  },
  // SiliconFlow models
  {
    keywords: ['siliconflow', 'silicon'],
    icon: SiliconCloudColor,
  },
  // BAAI models (Beijing Academy of Artificial Intelligence)
  {
    keywords: ['baai', 'bge', 'bge-large', 'bge-small', 'bge-base', 'bge-m3', 'bge-reranker'],
    icon: BAAI,
  },
  // Sentence Transformers / HuggingFace models
  {
    keywords: [
      'sentence-transformers',
      'all-mpnet',
      'all-minilm',
      'msmarco',
      'distilbert',
      'bert-base',
      'huggingface',
      'hf',
      'instructor',
      'e5-large',
      'e5-base',
      'e5-small',
    ],
    icon: HuggingFaceColor,
  },
  // Cohere embedding models
  {
    keywords: ['embed-english', 'embed-multilingual', 'cohere'],
    icon: CohereColor,
  },
  // Voyage AI models
  {
    keywords: [
      'voyage',
      'voyage-large',
      'voyage-code',
      'voyage-lite',
      'voyage-law',
      'voyage-multilingual',
      'voyage-finance',
      'rerank',
    ],
    icon: VoyageColor,
  },
  // Jina AI models
  {
    keywords: ['jina', 'jina-embeddings'],
    icon: Jina,
  },
  // Mistral models
  {
    keywords: ['mistral', 'mixtral'],
    icon: MistralColor,
  },
  // Perplexity models
  {
    keywords: ['perplexity', 'pplx'],
    icon: PerplexityColor,
  },
  // Together AI models
  {
    keywords: ['together', 'togetherai'],
    icon: TogetherColor,
  },
  // Alibaba models
  {
    keywords: ['text2vec', 'gte-large', 'gte-base', 'gte-small', 'alibaba'],
    icon: AlibabaColor,
  },
  // MiniMax models
  {
    keywords: ['minimax'],
    icon: OpenAI,
  },
  // LangChain models
  {
    keywords: ['langchain', 'langchain-community'],
    icon: LangChain,
  },
  // LlamaIndex models
  {
    keywords: ['llamaindex', 'llama-index'],
    icon: LlamaIndex,
  },
];

const DefaultModelIcon = OpenAI;

export function ModelIcon({ modelName, className = 'w-6 h-6' }: ModelIconProps) {
  const normalizedModelName = modelName.toLowerCase();

  const matchedIcon = MODEL_ICON_MAP.find(({ keywords }) =>
    keywords.some((keyword) => normalizedModelName.includes(keyword))
  );

  const IconComponent = matchedIcon?.icon || DefaultModelIcon;

  return <IconComponent className={className} />;
}

// Export mapping tables for reuse
export { PROVIDER_ICONS, MODEL_ICON_MAP };
