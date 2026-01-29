import type { SearchResult } from '../../types';
import type { VectorStoreProvider } from './types';

// KV-based vector store for free tier
// Stores vectors in KV and does brute-force cosine similarity search
// Not as efficient as Vectorize but works for small-medium datasets

interface StoredVector {
  id: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, string>;
}

const VECTORS_KEY = 'vectors_index';
const VECTORS_PREFIX = 'vec_';

export class KVVectorStore implements VectorStoreProvider {
  private kv: KVNamespace;

  constructor(kv: KVNamespace) {
    this.kv = kv;
  }

  async upsert(
    id: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, string>
  ): Promise<void> {
    const vector: StoredVector = {
      id,
      content,
      embedding,
      metadata,
    };

    // Store the vector
    await this.kv.put(`${VECTORS_PREFIX}${id}`, JSON.stringify(vector));

    // Update the index
    const index = await this.getIndex();
    if (!index.includes(id)) {
      index.push(id);
      await this.kv.put(VECTORS_KEY, JSON.stringify(index));
    }
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    const index = await this.getIndex();

    if (index.length === 0) {
      return [];
    }

    // Fetch all vectors (this is the limitation of KV-based approach)
    const vectors: StoredVector[] = [];

    // Batch fetch for efficiency
    const batchSize = 100;
    for (let i = 0; i < index.length; i += batchSize) {
      const batch = index.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map((id) => this.kv.get(`${VECTORS_PREFIX}${id}`))
      );

      for (const result of results) {
        if (result) {
          vectors.push(JSON.parse(result) as StoredVector);
        }
      }
    }

    // Calculate cosine similarity for each vector
    const scored = vectors.map((vec) => ({
      content: vec.content,
      metadata: vec.metadata,
      score: this.cosineSimilarity(queryEmbedding, vec.embedding),
    }));

    // Sort by score descending and return top K
    return scored.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  async delete(id: string): Promise<void> {
    await this.kv.delete(`${VECTORS_PREFIX}${id}`);

    const index = await this.getIndex();
    const newIndex = index.filter((i) => i !== id);
    await this.kv.put(VECTORS_KEY, JSON.stringify(newIndex));
  }

  async stats(): Promise<{ count: number }> {
    const index = await this.getIndex();
    return { count: index.length };
  }

  private async getIndex(): Promise<string[]> {
    const index = await this.kv.get(VECTORS_KEY);
    return index ? (JSON.parse(index) as string[]) : [];
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

    if (magnitude === 0) {
      return 0;
    }

    return dotProduct / magnitude;
  }
}
