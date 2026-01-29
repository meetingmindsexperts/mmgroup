import { CONFIG } from '../../config';
import type { ChatMessage } from '../../types';
import type { LLMProvider } from './types';

export class WorkersAILLM implements LLMProvider {
  private ai: Ai;
  private model: string;

  constructor(ai: Ai) {
    this.ai = ai;
    this.model = CONFIG.workersAi.chatModel;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const result = await this.ai.run(this.model as BaseAiTextGenerationModels, {
      messages: messages,
    });

    // Workers AI returns either a string or an object with response
    if (typeof result === 'string') {
      return result;
    }

    return (result as { response?: string }).response || '';
  }

  async chatStream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
    const stream = await this.ai.run(this.model as BaseAiTextGenerationModels, {
      messages: messages,
      stream: true,
    });

    // Workers AI returns a ReadableStream when streaming
    return stream as unknown as ReadableStream<Uint8Array>;
  }
}
