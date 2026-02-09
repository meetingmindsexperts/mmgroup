import { CONFIG } from '../config';
import type { Env, ChatRequest, ChatResponse, ChatMessage, LeadData, LeadCaptureResult } from '../types';
import { createEmbeddingsProvider } from '../providers/embeddings';
import { createLLMProvider } from '../providers/llm';
import { createVectorStoreProvider } from '../providers/vectorstore';
import { createLeadsProvider, isLeadCaptureEnabled } from '../providers/leads';
import { extractLeadInfo, validateEmail } from '../utils/leadDetection';
import { logChat } from './analytics';
import { isKnowledgeGap, logKnowledgeGap } from './knowledgeGaps';
import {
  getConversation,
  addMessage,
  formatPreviousMessages,
  getAccumulatedLeadInfo,
} from '../utils/conversationMemory';


export async function handleChat(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
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

    // Step 1: Load conversation history
    const conversation = await getConversation(env.VECTORS_KV, sessionId);
    const previousMessages = formatPreviousMessages(conversation);
    const accumulatedLeadInfo = getAccumulatedLeadInfo(conversation);
    const leadCaptureInProgress = conversation?.leadCaptureInProgress ?? false;

    // Step 2: Embed the user's query
    const queryEmbedding = await embeddings.embed(userMessage);

    // Step 3: Search for relevant context
    const searchResults = await vectorStore.search(queryEmbedding, CONFIG.rag.topK);

    // Step 4: Build the context from search results
    const context = searchResults
      .filter((r) => r.score > 0.1)
      .map((r) => r.content)
      .join('\n\n---\n\n');

    // Step 5: Build messages for the LLM
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
      messages.push({
        role: 'system',
        content: 'Note: The knowledge base is currently empty. You can still respond to greetings and provide the contact information from your system prompt, but you won\'t have specific content about services, events, or other details.',
      });
    }

    // Add previous conversation history for context
    if (previousMessages.length > 0) {
      messages.push(...previousMessages);
    }

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    // Step 6: Pre-validate lead info BEFORE LLM response (so LLM knows how to respond)
    let leadCaptureResult: LeadCaptureResult | null = null;
    let leadContext = '';
    let currentLeadInfo: { name?: string; email?: string; phone?: string } = {};
    let shouldShowLeadForm = false;
    let leadFormName: string | undefined;
    let leadFormEmail: string | undefined;
    let nextLeadCaptureInProgress = leadCaptureInProgress;

    if (isLeadCaptureEnabled(env)) {
      const leadInfo = extractLeadInfo(userMessage);
      const combinedName = leadInfo.name || accumulatedLeadInfo.name;
      const combinedEmail = leadInfo.email || accumulatedLeadInfo.email;
      const emailValidation = combinedEmail ? validateEmail(combinedEmail) : null;
      const nameJustProvided = !!leadInfo.name && !accumulatedLeadInfo.name;

      // Track what was found in current message for saving
      currentLeadInfo = {
        name: leadInfo.name,
        email: leadInfo.email,
        phone: leadInfo.phone,
      };

      const hasName = !!combinedName;
      const hasEmail = !!combinedEmail;

      if (!hasName) {
        leadContext = `\n\n[SYSTEM: The user has not provided their name yet. Ask for their name FIRST before answering any questions. Do NOT answer their question yet — just ask for their name in a friendly way. Example: "Hi there! I am MMG Assistant. Before I help you, may I know your name?"]`;
        nextLeadCaptureInProgress = true;
      } else if (nameJustProvided && !hasEmail) {
        // Greet by name and answer any pending question from earlier in the conversation.
        leadContext = `\n\n[SYSTEM: The user just provided their name. Greet them warmly by name ("Hi ${combinedName}!"). If the user asked a question earlier in the conversation that was not yet answered, answer it now politely using their name. Do NOT ask for their email yet.]`;
        nextLeadCaptureInProgress = true;
      } else if (hasEmail && emailValidation && !emailValidation.valid) {
        leadContext = `\n\n[SYSTEM: The user provided an INVALID email. Reason: ${emailValidation.reason}. Ask them for a different email address before answering.]`;
        nextLeadCaptureInProgress = true;
        shouldShowLeadForm = true;
        leadFormName = combinedName;
        leadFormEmail = combinedEmail || undefined;
      } else if (!hasEmail) {
        // For any subsequent requests/questions, ask for email before answering.
        leadContext = `\n\n[SYSTEM: Ask for the user's email before answering their request. Keep it brief and do NOT answer their question yet.]`;
        nextLeadCaptureInProgress = true;
        shouldShowLeadForm = true;
        leadFormName = combinedName;
        leadFormEmail = combinedEmail || undefined;
      } else if (hasEmail && emailValidation && emailValidation.valid) {
        // Email is captured; stop asking and proceed normally.
        leadContext = `\n\n[SYSTEM: The user's name is ${combinedName} and their email (${combinedEmail}) has already been captured. Do NOT ask for any contact information. Just answer their question normally and helpfully.]`;
        nextLeadCaptureInProgress = false;
      }

      // Add lead context to the message if we have any
      if (leadContext) {
        messages[messages.length - 1].content += leadContext;
      }
    }

    // Step 7: Generate response (now with email validation context)
    const response = await llm.chat(messages);

    // Step 8: Save conversation history
    await addMessage(
      env.VECTORS_KV,
      sessionId,
      { role: 'user', content: userMessage },
      currentLeadInfo,
      nextLeadCaptureInProgress
    );
    await addMessage(env.VECTORS_KV, sessionId, { role: 'assistant', content: response });

    // Step 9: Lead capture - save valid leads to database (using combined info)
    const combinedLeadInfoForCapture = {
      name: currentLeadInfo.name || accumulatedLeadInfo.name,
      email: currentLeadInfo.email || accumulatedLeadInfo.email,
      phone: currentLeadInfo.phone || accumulatedLeadInfo.phone,
    };

    if (isLeadCaptureEnabled(env) && combinedLeadInfoForCapture.email) {
      leadCaptureResult = await processLeadCaptureWithInfo(
        env,
        combinedLeadInfoForCapture,
        userMessage,
        sessionId,
        request
      );

      if (leadCaptureResult && !leadCaptureResult.captured && leadCaptureResult.validationMessage) {
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
      leadForm: shouldShowLeadForm
        ? { show: true, name: leadFormName, email: leadFormEmail }
        : undefined,
    };

    // Log chat for analytics and detect knowledge gaps (background D1 writes)
    const responseTime = Date.now() - startTime;
    const backgroundWork = (async () => {
      await logChat(env, {
        session_id: sessionId,
        message: userMessage,
        response: response,
        response_time_ms: responseTime,
        context_chunks: searchResults.filter((r) => r.score > 0.3).length,
        origin: request.headers.get('origin'),
        user_agent: request.headers.get('user-agent'),
      });

      // Log knowledge gap if RAG couldn't find relevant content
      if (isKnowledgeGap(userMessage, searchResults, leadCaptureInProgress)) {
        const bestScore = searchResults.length > 0
          ? Math.max(...searchResults.map((r) => r.score))
          : 0;
        await logKnowledgeGap(env, { question: userMessage, bestScore, sessionId });
      }
    })();

    if (ctx) {
      ctx.waitUntil(backgroundWork);
    }

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
 * Process lead capture with combined lead info from conversation
 * Uses accumulated name/email/phone from multiple messages
 */
async function processLeadCaptureWithInfo(
  env: Env,
  leadInfo: { name?: string; email?: string; phone?: string },
  userMessage: string,
  sessionId: string,
  request: Request
): Promise<LeadCaptureResult | null> {
  try {
    const leadsProvider = createLeadsProvider(env);
    if (!leadsProvider) {
      return null;
    }

    if (!leadInfo.email) {
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
