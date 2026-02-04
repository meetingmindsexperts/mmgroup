import { CONFIG } from '../config';
import type { Env, ChatRequest, ChatResponse, ChatMessage, LeadData, LeadCaptureResult } from '../types';
import { createEmbeddingsProvider } from '../providers/embeddings';
import { createLLMProvider } from '../providers/llm';
import { createVectorStoreProvider } from '../providers/vectorstore';
import { createLeadsProvider, isLeadCaptureEnabled } from '../providers/leads';
import { extractLeadInfo, validateEmail } from '../utils/leadDetection';
import { logChat } from './analytics';
import {
  getConversation,
  addMessage,
  formatPreviousMessages,
  getAccumulatedLeadInfo,
} from '../utils/conversationMemory';

// Patterns that indicate user is asking FOR information, not providing it
const ASKING_FOR_INFO_PATTERNS = [
  /\b(?:what(?:'s| is)?|where(?:'s| is)?|how|give me|send me|share|provide|show me)\b.*\b(?:email|phone|contact|number|address)\b/i,
  /\b(?:email|phone|contact|number|address)\b.*\b(?:please|address|info|information)\b/i,
  /\bi (?:want|need|would like)\b.*\b(?:email|phone|contact|the)\b/i,
  /\b(?:sales|support|team|company)\s+(?:email|phone|contact)\b/i,
  /\bcontact\s+(?:info|information|details)\b/i,
];

/**
 * Check if user is asking FOR contact information (not providing their own)
 */
function isAskingForInfo(message: string): boolean {
  return ASKING_FOR_INFO_PATTERNS.some((pattern) => pattern.test(message));
}

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

    // Step 1: Load conversation history
    const conversation = await getConversation(env.VECTORS_KV, sessionId);
    const previousMessages = formatPreviousMessages(conversation);
    const accumulatedLeadInfo = getAccumulatedLeadInfo(conversation);

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

    if (isLeadCaptureEnabled(env)) {
      // First check if user is asking FOR information (not providing their own)
      const askingForInfo = isAskingForInfo(userMessage);

      if (askingForInfo) {
        // User is asking for sales email, contact info, etc. - don't treat as lead capture
        // Let RAG/LLM answer from knowledge base
        leadContext = `\n\n[SYSTEM: The user is asking for contact information (sales email, phone, etc.). Answer their question using the knowledge base context. Do NOT ask for their contact info right now.]`;
      } else {
        const leadInfo = extractLeadInfo(userMessage);

        // Combine current message lead info with accumulated info from previous messages
        let combinedName = leadInfo.name || accumulatedLeadInfo.name;
        const combinedEmail = leadInfo.email || accumulatedLeadInfo.email;
        const combinedPhone = leadInfo.phone || accumulatedLeadInfo.phone;

        // Track what was found in current message for saving
        currentLeadInfo = {
          name: leadInfo.name,
          email: leadInfo.email,
          phone: leadInfo.phone,
        };

        const hasEmail = !!combinedEmail;
        const hasName = !!combinedName;

        // Check if we already have email from previous messages (email is sufficient, name is optional)
        const alreadyHaveEmail = !!accumulatedLeadInfo.email;

        if (alreadyHaveEmail && !leadInfo.email && !leadInfo.name) {
          // User already provided email in previous messages, don't ask again
          // Just let the LLM respond naturally to their question
          const nameInfo = accumulatedLeadInfo.name ? `${accumulatedLeadInfo.name}, ` : '';
          leadContext = `\n\n[SYSTEM: This user already provided their contact info earlier (${nameInfo}${accumulatedLeadInfo.email}). Do NOT ask for their name or email again. Just respond to their current question naturally.]`;
        } else if (hasEmail && hasName) {
          // We have both name and email (possibly from different messages)
          const validation = validateEmail(combinedEmail!);

          if (validation.valid) {
            leadContext = `\n\n[SYSTEM: We now have the user's name "${combinedName}" and a VALID email "${combinedEmail}". Thank them by name and confirm the team will follow up at their email. Do NOT question the validity.]`;
          } else {
            leadContext = `\n\n[SYSTEM: We have the user's name "${combinedName}" but an INVALID email. Reason: ${validation.reason}. Thank them for sharing their name, but politely ask for a different email address.]`;
          }
        } else if (hasEmail && !hasName) {
          // User provided email but no name yet
          const validation = validateEmail(combinedEmail!);

          if (validation.valid) {
            const emailPrefix = combinedEmail!.split('@')[0].toLowerCase();
            const genericPrefixes = ['info', 'contact', 'sales', 'support', 'admin', 'hello', 'hi', 'mail', 'email', 'office', 'team', 'enquiry', 'inquiry', 'help', 'service', 'noreply', 'no-reply'];
            const potentialName = emailPrefix.replace(/[._-]/g, ' ').split(' ')[0].replace(/\d+/g, '');
            const isGenericPrefix = genericPrefixes.includes(potentialName.toLowerCase());

            if (potentialName && potentialName.length >= 2 && !isGenericPrefix) {
              const capitalizedName = potentialName.charAt(0).toUpperCase() + potentialName.slice(1).toLowerCase();
              // Save derived name to currentLeadInfo so it persists in conversation memory
              currentLeadInfo.name = capitalizedName;
              combinedName = capitalizedName;
              leadContext = `\n\n[SYSTEM: The user provided a VALID email "${combinedEmail}". Their name appears to be "${capitalizedName}" (from email). Confirm receipt warmly: "Thank you, ${capitalizedName}! Our team will reach out to you at ${combinedEmail} shortly." Do NOT ask for more information.]`;
            } else {
              leadContext = `\n\n[SYSTEM: The user provided a VALID email "${combinedEmail}". Confirm receipt: "Thank you! Our team will reach out to you at ${combinedEmail} shortly." Do NOT ask for name or more information.]`;
            }
          } else {
            leadContext = `\n\n[SYSTEM: The user provided an INVALID email. Reason: ${validation.reason}. Politely ask for a different email address.]`;
          }
        } else if (hasName && !hasEmail) {
          // User provided name but no email yet
          leadContext = `\n\n[SYSTEM: The user provided their name "${combinedName}" but no email yet. Acknowledge their name warmly and ask: "Nice to meet you, ${combinedName}! Could you also share your email so our team can follow up with you?"]`;
        }
      }

      // Add lead context to the message if we have any
      if (leadContext) {
        messages[messages.length - 1].content += leadContext;
      }
    }

    // Step 7: Generate response (now with email validation context)
    const response = await llm.chat(messages);

    // Step 8: Save conversation history
    await addMessage(env.VECTORS_KV, sessionId, { role: 'user', content: userMessage }, currentLeadInfo);
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
