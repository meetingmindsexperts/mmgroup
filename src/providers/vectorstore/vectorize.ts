import type { SearchResult } from '../../types';
import type { VectorStoreProvider } from './types';

// Vectorize-based vector store for production
// Requires Workers Paid plan ($5/month)

export class VectorizeStore implements VectorStoreProvider {
  private index: VectorizeIndex;
  private kv: KVNamespace; // Used to store content (Vectorize only stores metadata)

  constructor(index: VectorizeIndex, kv: KVNamespace) {
    this.index = index;
    this.kv = kv;
  }

  async upsert(
    id: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, string>
  ): Promise<void> {
    // Store content in KV (Vectorize metadata has size limits)
    await this.kv.put(`content_${id}`, content);

    // Store vector in Vectorize
    await this.index.upsert([
      {
        id,
        values: embedding,
        metadata: metadata || {},
      },
    ]);
  }

  async search(queryEmbedding: number[], topK: number): Promise<SearchResult[]> {
    const results = await this.index.query(queryEmbedding, {
      topK,
      returnMetadata: 'all',
    });

    // Fetch content for each result
    const searchResults: SearchResult[] = [];

    for (const match of results.matches) {
      const content = await this.kv.get(`content_${match.id}`);

      if (content) {
        searchResults.push({
          content,
          score: match.score,
          metadata: match.metadata as Record<string, string> | undefined,
        });
      }
    }

    return searchResults;
  }

  async delete(id: string): Promise<void> {
    await this.index.deleteByIds([id]);
    await this.kv.delete(`content_${id}`);
  }

  async stats(): Promise<{ count: number }> {
    const described = await this.index.describe();
    return { count: described.vectorsCount };
  }

  async clear(): Promise<void> {
    // Vectorize doesn't have a bulk delete, so this is a no-op for now
    // Would need to iterate through all vectors and delete them individually
    throw new Error('Clear not implemented for Vectorize. Please recreate the index.');
  }
}
