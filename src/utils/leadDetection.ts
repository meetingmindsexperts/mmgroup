/**
 * Lead Detection Utilities
 *
 * Detects user intent for lead capture and extracts contact information from messages.
 */

// Keywords that indicate user interest in services/contact
const LEAD_INTENT_KEYWORDS = [
  'interested',
  'want to learn',
  'learn more',
  'contact',
  'get in touch',
  'reach out',
  'demo',
  'pricing',
  'quote',
  'schedule',
  'meeting',
  'consultation',
  'partnership',
  'collaborate',
  'work together',
  'services',
  'hire',
  'book',
  'appointment',
  'call me',
  'call back',
  'speak to',
  'talk to',
  'sign up',
  'register',
  'subscribe',
];

// Disposable email domains to reject
const DISPOSABLE_DOMAINS = [
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  '10minutemail.com',
  'throwaway.email',
  'fakeinbox.com',
  'trashmail.com',
  'getnada.com',
  'temp-mail.org',
  'tempail.com',
  'mohmal.com',
  'dispostable.com',
  'maildrop.cc',
  'yopmail.com',
  'sharklasers.com',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'grr.la',
  'getairmail.com',
];

// Email regex pattern
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

// Phone regex pattern (international formats)
const PHONE_REGEX = /(?:\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}/g;

// Name pattern (ordered by specificity - most specific first)
const NAME_PATTERNS = [
  // "my name is John Smith" or "name is John Smith" - most explicit
  /(?:my name is|name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  // "I'm John Smith" or "I am John Smith" - require two-word name to avoid "I am interested"
  /(?:i'm|i am)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
  // "this is John Smith"
  /this is\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
  // "John Smith here" or "John Smith speaking"
  /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:here|speaking)/i,
  // "John Smith, my email is..." or "John Smith. Email:"
  /^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*[,.]?\s*(?:my email|email|here)/i,
  // "call me John" or "you can call me John Smith"
  /call me\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
];

// Common words that should NOT be treated as names
const NOT_NAMES = new Set([
  'hi', 'hello', 'hey', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank', 'please',
  'help', 'contact', 'sales', 'support', 'info', 'question', 'inquiry',
  'interested', 'demo', 'pricing', 'quote', 'meeting', 'call', 'email',
  'subscribe', 'register', 'book', 'schedule', 'service', 'services',
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
  'can', 'may', 'might', 'must', 'shall', 'need', 'want', 'like', 'more',
  'about', 'with', 'from', 'your', 'you', 'me', 'my', 'i', 'we', 'us', 'our',
  'what', 'when', 'where', 'why', 'how', 'which', 'who', 'whom', 'whose',
]);

export interface ExtractedLeadInfo {
  name?: string;
  email?: string;
  phone?: string;
  hasLeadIntent: boolean;
}

/**
 * Detect if the user's message shows intent for lead capture
 */
export function detectLeadIntent(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return LEAD_INTENT_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}

/**
 * Extract email from text
 */
export function extractEmail(text: string): string | null {
  const matches = text.match(EMAIL_REGEX);
  return matches ? matches[0].toLowerCase() : null;
}

/**
 * Extract phone number from text
 */
export function extractPhone(text: string): string | null {
  const matches = text.match(PHONE_REGEX);
  if (!matches) return null;

  // Clean up the phone number - keep only digits
  const cleaned = matches[0].replace(/[^\d+]/g, '');

  // Must have at least 7 digits to be a valid phone
  if (cleaned.replace(/\D/g, '').length < 7) return null;

  return cleaned;
}

/**
 * Extract name from text
 */
export function extractName(text: string): string | null {
  // First try explicit patterns like "my name is..."
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const extractedName = match[1].trim();
      // Validate that extracted name is not a common word
      const nameWords = extractedName.toLowerCase().split(/\s+/);
      const isCommonWord = nameWords.some((word) => NOT_NAMES.has(word));
      if (!isCommonWord) {
        return extractedName;
      }
      // Pattern matched but extracted a common word, continue to next pattern
    }
  }

  // Fallback: check if the message is a standalone name (1-3 words, no email/common words)
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/);

  // Only consider short messages (1-3 words) as potential standalone names
  if (words.length >= 1 && words.length <= 3) {
    // Check if any word is a common non-name word
    const hasCommonWord = words.some((word) => NOT_NAMES.has(word.toLowerCase()));

    // Check if message contains email or looks like a question/command
    const hasEmail = EMAIL_REGEX.test(trimmed);
    const isQuestion = trimmed.includes('?');
    const hasSpecialChars = /[@#$%^&*()+=\[\]{}|\\<>\/]/.test(trimmed);

    // If it's short, doesn't have common words, no email, not a question
    if (!hasCommonWord && !hasEmail && !isQuestion && !hasSpecialChars) {
      // Capitalize each word properly and return as name
      const potentialName = words
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

      // Final check: must have at least 2 characters per word
      if (words.every((word) => word.length >= 2)) {
        return potentialName;
      }
    }
  }

  return null;
}

/**
 * Validate email format
 */
export function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 254;
}

/**
 * Check if email is from a disposable domain
 */
export function isDisposableEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase();
  return domain ? DISPOSABLE_DOMAINS.includes(domain) : false;
}

/**
 * Full email validation (format + disposable check)
 */
export function validateEmail(email: string): { valid: boolean; reason?: string } {
  if (!isValidEmailFormat(email)) {
    return { valid: false, reason: 'Invalid email format' };
  }

  if (isDisposableEmail(email)) {
    return { valid: false, reason: 'Please use a non-disposable email address' };
  }

  return { valid: true };
}

/**
 * Extract all lead information from a message
 */
export function extractLeadInfo(message: string): ExtractedLeadInfo {
  return {
    name: extractName(message) || undefined,
    email: extractEmail(message) || undefined,
    phone: extractPhone(message) || undefined,
    hasLeadIntent: detectLeadIntent(message),
  };
}

/**
 * Check if a message contains contact information worth capturing
 */
export function hasContactInfo(message: string): boolean {
  const email = extractEmail(message);
  const phone = extractPhone(message);
  return !!(email || phone);
}
