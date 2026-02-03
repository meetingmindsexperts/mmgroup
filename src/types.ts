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

// Lead capture data (matches Supabase mmg_chat_leads table)
export interface LeadData {
  name?: string;
  email: string;
  phone?: number;
  ip_address?: string;
  chat_context?: Record<string, unknown>;
  valid_email?: boolean;
  session_id?: number;
}

export interface LeadCaptureResult {
  captured: boolean;
  leadId?: string;
  emailValid?: boolean;
  validationMessage?: string;
}

export interface EmailValidationResult {
  valid: boolean;
  reason?: string;
}

// Environment bindings
export interface Env {
  // KV for vector storage (free tier)
  VECTORS_KV: KVNamespace;

  // D1 for chat analytics
  ANALYTICS_DB: D1Database;

  // Vectorize (when upgrading)
  VECTORS_INDEX?: VectorizeIndex;

  // Workers AI (optional)
  AI?: Ai;

  // Configuration
  OPENAI_API_KEY: string;

  // Supabase for lead capture
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  CHATBOT_API_KEY: string; // Secret key to authenticate with Supabase edge function

  // Provider toggles
  VECTOR_STORE: 'kv' | 'vectorize';
  LLM_PROVIDER: 'openai' | 'workers-ai';
  EMBEDDING_PROVIDER: 'openai' | 'workers-ai';

  // CORS
  ALLOWED_ORIGIN: string;
}
