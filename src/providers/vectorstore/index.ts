import type { Env } from '../../types';
import type { VectorStoreProvider } from './types';
import { KVVectorStore } from './kv';
import { VectorizeStore } from './vectorize';

export type { VectorStoreProvider } from './types';

export function createVectorStoreProvider(env: Env): VectorStoreProvider {
  const provider = env.VECTOR_STORE || 'kv';

  if (provider === 'vectorize') {
    if (!env.VECTORS_INDEX) {
      throw new Error('Vectorize index not configured');
    }
    return new VectorizeStore(env.VECTORS_INDEX, env.VECTORS_KV);
  }

  if (!env.VECTORS_KV) {
    throw new Error('KV namespace not configured');
  }
  return new KVVectorStore(env.VECTORS_KV);
}
