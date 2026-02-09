/**
 * Conversation Memory Utility
 *
 * Stores and retrieves conversation history per session using KV storage.
 * This allows the chatbot to remember previous messages in a conversation.
 */

import type { ChatMessage } from '../types';

interface ConversationData {
  messages: ChatMessage[];
  leadInfo?: {
    name?: string;
    email?: string;
    phone?: string;
  };
  leadCaptureInProgress?: boolean;
  updatedAt: number;
}

const CONVERSATION_TTL = 60 * 60 * 24; // 24 hours
const MAX_MESSAGES = 10; // Keep last 10 messages for context

/**
 * Get conversation history for a session
 */
export async function getConversation(
  kv: KVNamespace,
  sessionId: string
): Promise<ConversationData | null> {
  try {
    const key = `conversation:${sessionId}`;
    const data = await kv.get(key, 'json');
    return data as ConversationData | null;
  } catch (error) {
    console.error('Error getting conversation:', error);
    return null;
  }
}

/**
 * Save conversation history for a session
 */
export async function saveConversation(
  kv: KVNamespace,
  sessionId: string,
  data: ConversationData
): Promise<void> {
  try {
    const key = `conversation:${sessionId}`;

    // Keep only the last N messages to avoid KV size limits
    const trimmedData: ConversationData = {
      ...data,
      messages: data.messages.slice(-MAX_MESSAGES),
      updatedAt: Date.now(),
    };

    await kv.put(key, JSON.stringify(trimmedData), {
      expirationTtl: CONVERSATION_TTL,
    });
  } catch (error) {
    console.error('Error saving conversation:', error);
  }
}

/**
 * Add a message to conversation history
 */
export async function addMessage(
  kv: KVNamespace,
  sessionId: string,
  message: ChatMessage,
  leadInfo?: { name?: string; email?: string; phone?: string },
  leadCaptureInProgress?: boolean
): Promise<void> {
  const existing = await getConversation(kv, sessionId);

  // Only update lead info fields that are actually defined (non-undefined)
  // to prevent overwriting previously captured values with undefined
  const mergedLeadInfo = { ...existing?.leadInfo };
  if (leadInfo?.name) mergedLeadInfo.name = leadInfo.name;
  if (leadInfo?.email) mergedLeadInfo.email = leadInfo.email;
  if (leadInfo?.phone) mergedLeadInfo.phone = leadInfo.phone;

  const updatedData: ConversationData = {
    messages: [...(existing?.messages || []), message],
    leadInfo: mergedLeadInfo,
    leadCaptureInProgress:
      typeof leadCaptureInProgress === 'boolean'
        ? leadCaptureInProgress
        : existing?.leadCaptureInProgress,
    updatedAt: Date.now(),
  };

  await saveConversation(kv, sessionId, updatedData);
}

/**
 * Get previous messages formatted for LLM context
 */
export function formatPreviousMessages(conversation: ConversationData | null): ChatMessage[] {
  if (!conversation || conversation.messages.length === 0) {
    return [];
  }

  // Return user and assistant messages (not system messages)
  return conversation.messages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );
}

/**
 * Get accumulated lead info from conversation
 */
export function getAccumulatedLeadInfo(conversation: ConversationData | null): {
  name?: string;
  email?: string;
  phone?: string;
} {
  return conversation?.leadInfo || {};
}
