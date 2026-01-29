import type { ChatMessage } from '../../types';

// LLM provider interface

export interface LLMProvider {
  /**
   * Generate a chat completion
   */
  chat(messages: ChatMessage[]): Promise<string>;

  /**
   * Generate a streaming chat completion
   */
  chatStream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>>;
}
