import { CONFIG } from '../config';
import type { Env, ChatRequest, ChatResponse, ChatMessage, LeadData, LeadCaptureResult } from '../types';
import { createEmbeddingsProvider } from '../providers/embeddings';
import { createLLMProvider } from '../providers/llm';
import { createVectorStoreProvider } from '../providers/vectorstore';
import { createLeadsProvider, isLeadCaptureEnabled } from '../providers/leads';
import { extractLeadInfo, hasContactInfo, validateEmail } from '../utils/leadDetection';
import { logChat } from './analytics';

export async function handleChat(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();

  // Parse JSON body with specific error handling
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
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

    // Initialize providers - all queries go through RAG + AI
    const embeddings = createEmbeddingsProvider(env);
    const llm = createLLMProvider(env);
    const vectorStore = createVectorStoreProvider(env);

    // Step 1: Embed the user's query
    const queryEmbedding = await embeddings.embed(userMessage);

    // Step 2: Search for relevant context
    const searchResults = await vectorStore.search(queryEmbedding, CONFIG.rag.topK);

    // Step 3: Build the context from search results
    // Lower threshold to 0.1 to include more potentially relevant content
    const context = searchResults
      .filter((r) => r.score > 0.1)
      .map((r) => r.content)
      .join('\n\n---\n\n');

    // Step 4: Build messages for the LLM
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: CONFIG.systemPrompt,
      },
    ];

    // Add context if we found relevant documents, or note if knowledge base is empty
    if (context.length > 0) {
      messages.push({
        role: 'system',
        content: `Here is relevant information to help answer the user's question:\n\n${context}`,
      });
    } else if (searchResults.length === 0) {
      // Knowledge base is completely empty
      messages.push({
        role: 'system',
        content: 'Note: The knowledge base is currently empty. You can still respond to greetings and provide the contact information from your system prompt, but you won\'t have specific content about services, events, or other details.',
      });
    }

    // Add user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    // Step 5: Generate response
    let response = await llm.chat(messages);

    // Step 6: Lead capture - check if user provided contact info
    let leadCaptureResult: LeadCaptureResult | null = null;
    if (isLeadCaptureEnabled(env) && hasContactInfo(userMessage)) {
      leadCaptureResult = await processLeadCapture(env, userMessage, sessionId, request);

      // If email was invalid, add context for the next response
      if (leadCaptureResult && !leadCaptureResult.captured && leadCaptureResult.validationMessage) {
        // The LLM response already went out, but we note it for analytics
        console.log('Lead capture failed:', leadCaptureResult.validationMessage);
      }
    }

    // Get source URLs if available
    const sources = searchResults
      .filter((r) => r.score > 0.5 && r.metadata?.url)
      .map((r) => r.metadata!.url!)
      .filter((url, index, arr) => arr.indexOf(url) === index); // Dedupe

    const result: ChatResponse & { leadCaptured?: boolean } = {
      response,
      sessionId,
      sources: sources.length > 0 ? sources : undefined,
      leadCaptured: leadCaptureResult?.captured,
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
  // Parse JSON body with specific error handling
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return Response.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {
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

    // Add context if we found relevant documents, or note if knowledge base is empty
    if (context.length > 0) {
      messages.push({
        role: 'system',
        content: `Here is relevant information to help answer the user's question:\n\n${context}`,
      });
    } else if (searchResults.length === 0) {
      // Knowledge base is completely empty
      messages.push({
        role: 'system',
        content: 'Note: The knowledge base is currently empty. You can still respond to greetings and provide the contact information from your system prompt, but you won\'t have specific content about services, events, or other details.',
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

/**
 * Process lead capture from user message
 * Extracts contact info, validates email, and saves to Supabase
 */
async function processLeadCapture(
  env: Env,
  userMessage: string,
  sessionId: string,
  request: Request
): Promise<LeadCaptureResult | null> {
  try {
    const leadsProvider = createLeadsProvider(env);
    if (!leadsProvider) {
      return null;
    }

    // Extract contact information from the message
    const leadInfo = extractLeadInfo(userMessage);

    if (!leadInfo.email) {
      // No email found, can't capture lead
      return null;
    }

    // Validate email (format + disposable check)
    const validation = validateEmail(leadInfo.email);
    if (!validation.valid) {
      return {
        captured: false,
        emailValid: false,
        validationMessage: validation.reason,
      };
    }

    // Also validate via Supabase edge function if available
    const serverValidation = await leadsProvider.validateEmail(leadInfo.email);
    if (!serverValidation.valid) {
      return {
        captured: false,
        emailValid: false,
        validationMessage: serverValidation.reason,
      };
    }

    // Get IP address from request headers
    const ipAddress =
      request.headers.get('cf-connecting-ip') ||
      request.headers.get('x-forwarded-for')?.split(',')[0] ||
      null;

    // Parse phone number to integer if present
    const phoneNumber = leadInfo.phone ? parseInt(leadInfo.phone.replace(/\D/g, ''), 10) : undefined;

    // Save the lead
    const lead: LeadData = {
      name: leadInfo.name,
      email: leadInfo.email,
      phone: phoneNumber && !isNaN(phoneNumber) ? phoneNumber : undefined,
      ip_address: ipAddress || undefined,
      chat_context: {
        message: userMessage.slice(0, 500),
        timestamp: new Date().toISOString(),
      },
      valid_email: true,
      session_id: parseInt(sessionId.replace(/\D/g, '').slice(0, 15), 10) || undefined,
    };

    const result = await leadsProvider.saveLead(lead);
    return result;
  } catch (error) {
    console.error('Lead capture error:', error);
    return null;
  }
}
