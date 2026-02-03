/**
 * Supabase Edge Function: validate-email
 *
 * Validates email addresses for format and disposable domain check.
 *
 * Deploy with: supabase functions deploy validate-email
 *
 * Usage:
 *   POST /functions/v1/validate-email
 *   Body: { "email": "test@example.com" }
 *   Response: { "valid": true } or { "valid": false, "reason": "..." }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// Extended list of disposable email domains
const DISPOSABLE_DOMAINS = [
  // Common disposable services
  'mailinator.com',
  'guerrillamail.com',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'tempmail.com',
  'temp-mail.org',
  'temp-mail.io',
  '10minutemail.com',
  '10minutemail.net',
  'throwaway.email',
  'fakeinbox.com',
  'trashmail.com',
  'trashmail.net',
  'getnada.com',
  'tempail.com',
  'mohmal.com',
  'dispostable.com',
  'maildrop.cc',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'sharklasers.com',
  'guerrillamailblock.com',
  'pokemail.net',
  'spam4.me',
  'grr.la',
  'getairmail.com',
  'mailnesia.com',
  'mailcatch.com',
  'mytrashmail.com',
  'mt2009.com',
  'thankyou2010.com',
  'trash2009.com',
  'mt2014.com',
  'mailforspam.com',
  'spamgourmet.com',
  'spamherelots.com',
  'spaml.com',
  'tempr.email',
  'discard.email',
  'discardmail.com',
  'spambog.com',
  'spambog.de',
  'spambog.ru',
  'mailexpire.com',
  'tempinbox.com',
  'fakemailgenerator.com',
  'emailondeck.com',
  'mintemail.com',
  'sofimail.com',
  'mailcatch.com',
  'wegwerfmail.de',
  'wegwerfmail.net',
  'wegwerfmail.org',
  'emailsensei.com',
  'guerrillamail.biz',
  'spamfree24.org',
  'spamfree24.de',
  'spamfree24.eu',
  'spamfree24.info',
  'spamfree24.net',
  'incognitomail.com',
  'incognitomail.net',
  'incognitomail.org',
  'anonymbox.com',
  'mailnull.com',
  'e4ward.com',
  'spamex.com',
  'spam.la',
  'mytempemail.com',
  'burnermail.io',
  'tempsky.com',
];

// Email format regex (RFC 5322 simplified)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ValidationRequest {
  email: string;
}

interface ValidationResponse {
  valid: boolean;
  reason?: string;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ valid: false, reason: 'Method not allowed' }),
      {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    const body: ValidationRequest = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return jsonResponse({ valid: false, reason: 'Email is required' }, 400);
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Check format
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      return jsonResponse({ valid: false, reason: 'Invalid email format' });
    }

    // Check length
    if (trimmedEmail.length > 254) {
      return jsonResponse({ valid: false, reason: 'Email address is too long' });
    }

    // Extract domain
    const domain = trimmedEmail.split('@')[1];
    if (!domain) {
      return jsonResponse({ valid: false, reason: 'Invalid email format' });
    }

    // Check disposable domains
    if (DISPOSABLE_DOMAINS.includes(domain)) {
      return jsonResponse({
        valid: false,
        reason: 'Please use a non-disposable email address',
      });
    }

    // Check for common disposable patterns
    const disposablePatterns = [
      /^temp/i,
      /^trash/i,
      /^spam/i,
      /^fake/i,
      /^throwaway/i,
      /^disposable/i,
      /^mailinator/i,
      /^guerrilla/i,
    ];

    for (const pattern of disposablePatterns) {
      if (pattern.test(domain)) {
        return jsonResponse({
          valid: false,
          reason: 'Please use a non-disposable email address',
        });
      }
    }

    // Email passed all checks
    return jsonResponse({ valid: true });
  } catch (error) {
    console.error('Validation error:', error);
    return jsonResponse({ valid: false, reason: 'Validation error occurred' }, 500);
  }
});

function jsonResponse(data: ValidationResponse, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
