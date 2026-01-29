// Embeddings provider interface

export interface EmbeddingsProvider {
  /**
   * Generate embeddings for a single text
   */
  embed(text: string): Promise<number[]>;

  /**
   * Generate embeddings for multiple texts
   */
  embedBatch(texts: string[]): Promise<number[][]>;

  /**
   * Get the dimension of embeddings produced by this provider
   */
  getDimensions(): number;
}
