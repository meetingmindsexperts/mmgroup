import { CONFIG } from '../config';
import type { Env, ChatRequest, ChatResponse, ChatMessage } from '../types';
import { createEmbeddingsProvider } from '../providers/embeddings';
import { createLLMProvider } from '../providers/llm';
import { createVectorStoreProvider } from '../providers/vectorstore';
import { logChat } from './analytics';

// Contact query detection - instant response for static contact info only
// All other queries go through RAG + AI pipeline
const CONTACT_PATTERNS = [
  /\bcontact\b/i,
  /\bget\s*in\s*touch\b/i,
  /\breach\s*(out|you)\b/i,
  /\bemail\b/i,
  /\bphone\s*(number)?\b/i,
  /\bcall\s*(you|us)?\b/i,
  /\baddress\b/i,
  /\blocation\b/i,
  /\bwhere\s*(are\s*)?you\s*(located)?\b/i,
  /\bhow\s*(can|do)\s*i\s*(contact|reach|connect)\b/i,
  /\bspeak\s*(to|with)\s*(someone|sales|team)\b/i,
  /\btalk\s*to\s*(sales|someone|team)\b/i,
];

const CONTACT_RESPONSE = `You can reach Meeting Minds Group through:

**Address:** 508 & 509, DSC Tower, Dubai Studio City, Dubai, UAE

**Websites:**
- Main: meetingmindsgroup.com
- Experts: meetingmindsexperts.com
- MedCom: medicalmindsexperts.com
- Online Learning: medulive.online

Feel free to visit our websites or reach out through the contact forms available on each site.`;

function isContactQuery(message: string): boolean {
  return CONTACT_PATTERNS.some((pattern) => pattern.test(message));
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();

  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.message || typeof body.message !== 'string') {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    const userMessage = body.message.trim();

    if (userMessage.length === 0) {
      return Response.json({ error: 'Message cannot be empty' }, { status: 400 });
    }

    if (userMessage.length > 2000) {
      return Response.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 });
    }

    const sessionId = body.sessionId || crypto.randomUUID();

    // Instant response for contact queries only (static info)
    // All other queries go through RAG + AI
    if (isContactQuery(userMessage)) {
      const responseTime = Date.now() - startTime;
      logChat(env, {
        session_id: sessionId,
        message: userMessage,
        response: CONTACT_RESPONSE,
        response_time_ms: responseTime,
        context_chunks: 0,
        origin: request.headers.get('origin'),
        user_agent: request.headers.get('user-agent'),
      });

      return Response.json({
        response: CONTACT_RESPONSE,
        sessionId,
      } as ChatResponse);
    }

    // Initialize providers
    const embeddings = createEmbeddingsProvider(env);
    const llm = createLLMProvider(env);
    const vectorStore = createVectorStoreProvider(env);

    // Step 1: Embed the user's query
    const queryEmbedding = await embeddings.embed(userMessage);

    // Step 2: Search for relevant context
    const searchResults = await vectorStore.search(queryEmbedding, CONFIG.rag.topK);

    // Step 3: Build the context from search results
    const context = searchResults
      .filter((r) => r.score > 0.3) // Only use relevant results
      .map((r) => r.content)
      .join('\n\n---\n\n');

    // Step 4: Build messages for the LLM
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: CONFIG.systemPrompt,
      },
    ];

    // Add context if we found relevant documents
    if (context.length > 0) {
      messages.push({
        role: 'system',
        content: `Here is relevant information to help answer the user's question:\n\n${context}`,
      });
    }

    // Add user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    // Step 5: Generate response
    const response = await llm.chat(messages);

    // Get source URLs if available
    const sources = searchResults
      .filter((r) => r.score > 0.5 && r.metadata?.url)
      .map((r) => r.metadata!.url!)
      .filter((url, index, arr) => arr.indexOf(url) === index); // Dedupe

    const result: ChatResponse = {
      response,
      sessionId,
      sources: sources.length > 0 ? sources : undefined,
    };

    // Log chat for analytics (non-blocking)
    const responseTime = Date.now() - startTime;
    logChat(env, {
      session_id: sessionId,
      message: userMessage,
      response: response,
      response_time_ms: responseTime,
      context_chunks: searchResults.filter((r) => r.score > 0.3).length,
      origin: request.headers.get('origin'),
      user_agent: request.headers.get('user-agent'),
    });

    return Response.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { error: 'An error occurred processing your request', details: errorMessage },
      { status: 500 }
    );
  }
}

// Streaming chat endpoint
export async function handleChatStream(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as ChatRequest;

    if (!body.message || typeof body.message !== 'string') {
      return Response.json({ error: 'Message is required' }, { status: 400 });
    }

    const userMessage = body.message.trim();

    // Initialize providers
    const embeddings = createEmbeddingsProvider(env);
    const llm = createLLMProvider(env);
    const vectorStore = createVectorStoreProvider(env);

    const sessionId = body.sessionId || crypto.randomUUID();

    // Embed and search
    const queryEmbedding = await embeddings.embed(userMessage);
    const searchResults = await vectorStore.search(queryEmbedding, CONFIG.rag.topK);

    const context = searchResults
      .filter((r) => r.score > 0.3)
      .map((r) => r.content)
      .join('\n\n---\n\n');

    // Build messages
    const messages: ChatMessage[] = [
      { role: 'system', content: CONFIG.systemPrompt },
    ];

    if (context.length > 0) {
      messages.push({
        role: 'system',
        content: `Here is relevant information to help answer the user's question:\n\n${context}`,
      });
    }

    messages.push({ role: 'user', content: userMessage });

    // Get streaming response
    const stream = await llm.chatStream(messages);

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Session-ID': sessionId,
      },
    });
  } catch (error) {
    console.error('Chat stream error:', error);
    return Response.json(
      { error: 'An error occurred processing your request' },
      { status: 500 }
    );
  }
}
