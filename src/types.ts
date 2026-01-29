// Shared types for the chat application

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
}

export interface ChatResponse {
  response: string;
  sessionId: string;
  sources?: string[];
}

export interface IngestRequest {
  content: string;
  metadata?: {
    url?: string;
    title?: string;
    type?: 'webpage' | 'document' | 'faq';
  };
}

export interface VectorDocument {
  id: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, string>;
}

export interface SearchResult {
  content: string;
  score: number;
  metadata?: Record<string, string>;
}

// Environment bindings
export interface Env {
  // KV for vector storage (free tier)
  VECTORS_KV: KVNamespace;

  // D1 for chat history (optional - for future use)
  CHAT_DB?: D1Database;

  // Vectorize (when upgrading)
  VECTORS_INDEX?: VectorizeIndex;

  // Workers AI (optional)
  AI?: Ai;

  // Configuration
  OPENAI_API_KEY: string;

  // Provider toggles
  VECTOR_STORE: 'kv' | 'vectorize';
  LLM_PROVIDER: 'openai' | 'workers-ai';
  EMBEDDING_PROVIDER: 'openai' | 'workers-ai';

  // CORS
  ALLOWED_ORIGIN: string;
}
