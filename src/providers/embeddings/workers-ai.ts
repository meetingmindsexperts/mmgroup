import { CONFIG } from '../../config';
import type { EmbeddingsProvider } from './types';

export class WorkersAIEmbeddings implements EmbeddingsProvider {
  private ai: Ai;
  private model: string;

  constructor(ai: Ai) {
    this.ai = ai;
    this.model = CONFIG.workersAi.embeddingModel;
  }

  async embed(text: string): Promise<number[]> {
    const result = await this.ai.run(this.model as BaseAiTextEmbeddingsModels, {
      text: [text],
    });
    return result.data[0];
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const result = await this.ai.run(this.model as BaseAiTextEmbeddingsModels, {
      text: texts,
    });
    return result.data;
  }

  getDimensions(): number {
    return CONFIG.workersAi.embeddingDimensions;
  }
}
