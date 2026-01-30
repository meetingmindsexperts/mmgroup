import type { SearchResult } from '../../types';

// Vector store interface

export interface VectorStoreProvider {
  /**
   * Store a document with its embedding
   */
  upsert(
    id: string,
    content: string,
    embedding: number[],
    metadata?: Record<string, string>
  ): Promise<void>;

  /**
   * Search for similar documents
   */
  search(embedding: number[], topK: number): Promise<SearchResult[]>;

  /**
   * Delete a document by ID
   */
  delete(id: string): Promise<void>;

  /**
   * Get stats about the vector store
   */
  stats(): Promise<{ count: number }>;

  /**
   * Clear all vectors from the store
   */
  clear(): Promise<void>;
}
