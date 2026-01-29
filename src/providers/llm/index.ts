import type { Env } from '../../types';
import type { LLMProvider } from './types';
import { OpenAILLM } from './openai';
import { WorkersAILLM } from './workers-ai';

export type { LLMProvider } from './types';

export function createLLMProvider(env: Env): LLMProvider {
  const provider = env.LLM_PROVIDER || 'openai';

  if (provider === 'workers-ai') {
    if (!env.AI) {
      throw new Error('Workers AI binding not configured');
    }
    return new WorkersAILLM(env.AI);
  }

  if (!env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }
  return new OpenAILLM(env.OPENAI_API_KEY);
}
