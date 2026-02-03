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
  for (const pattern of NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return match[1].trim();
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
