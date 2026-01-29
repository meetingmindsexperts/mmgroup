import type { Env } from '../../types';
import type { EmbeddingsProvider } from './types';
import { OpenAIEmbeddings } from './openai';
import { WorkersAIEmbeddings } from './workers-ai';

export type { EmbeddingsProvider } from './types';

export function createEmbeddingsProvider(env: Env): EmbeddingsProvider {
  const provider = env.EMBEDDING_PROVIDER || 'openai';

  if (provider === 'workers-ai') {
    if (!env.AI) {
      throw new Error('Workers AI binding not configured');
    }
    return new WorkersAIEmbeddings(env.AI);
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return new OpenAIEmbeddings(env.OPENAI_API_KEY);
}
