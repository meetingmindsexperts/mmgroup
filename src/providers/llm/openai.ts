import { CONFIG } from '../../config';
import type { ChatMessage } from '../../types';
import type { LLMProvider } from './types';

export class OpenAILLM implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.model = CONFIG.openai.chatModel;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Chat API error: ${error}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };

    return data.choices[0]?.message?.content || '';
  }

  async chatStream(messages: ChatMessage[]): Promise<ReadableStream<Uint8Array>> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 1000,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI Chat API error: ${error}`);
    }

    const reader = response.body!.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new ReadableStream({
      async pull(controller) {
        const { done, value } = await reader.read();

        if (done) {
          controller.close();
          return;
        }

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter((line) => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6); // Remove 'data: ' prefix

          if (data === '[DONE]') {
            controller.close();
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices: Array<{ delta: { content?: string } }>;
            };
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          } catch {
            // Skip invalid JSON
          }
        }
      },
    });
  }
}
