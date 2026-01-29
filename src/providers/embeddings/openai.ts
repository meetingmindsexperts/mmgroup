import { CONFIG } from '../../config';
import type { EmbeddingsProvider } from './types';

export class OpenAIEmbeddings implements EmbeddingsProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = CONFIG.openai.embeddingModel;
  }

  async embed(text: string): Promise<number[]> {
    const embeddings = await this.embedBatch([text]);
    return embeddings[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Embeddings API error: ${error}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain order
    return data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }

  getDimensions(): number {
    return CONFIG.openai.embeddingDimensions;
  }
}
