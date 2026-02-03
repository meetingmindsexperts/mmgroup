/**
 * Supabase Edge Function: capture-lead
 *
 * Securely captures leads from the MMG chatbot.
 * Validates the request using a secret API key, then inserts into the database.
 *
 * Deploy with: supabase functions deploy capture-lead --no-verify-jwt
 *
 * Environment variables needed in Supabase:
 *   CHATBOT_API_KEY - Secret key shared with the Cloudflare worker
 *
 * Usage:
 *   POST /functions/v1/capture-lead
 *   Headers: x-chatbot-key: <your-secret-key>
 *   Body: { name, email, phone, ip_address, chat_context, valid_email, session_id }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface LeadData {
  name?: string;
  email: string;
  phone?: number;
  ip_address?: string;
  chat_context?: Record<string, unknown>;
  valid_email?: boolean;
  session_id?: number;
}

serve(async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-chatbot-key',
      },
    });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    // Validate the chatbot API key
    const chatbotKey = req.headers.get('x-chatbot-key');
    const expectedKey = Deno.env.get('CHATBOT_API_KEY');

    if (!expectedKey) {
      console.error('CHATBOT_API_KEY not configured');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    if (!chatbotKey || chatbotKey !== expectedKey) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Parse the lead data
    const leadData: LeadData = await req.json();

    if (!leadData.email) {
      return jsonResponse({ error: 'Email is required' }, 400);
    }

    // Create Supabase client with service role (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Supabase credentials not configured');
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Insert the lead
    const { data, error } = await supabase
      .from('mmg_chat_leads')
      .insert({
        name: leadData.name || null,
        email: leadData.email,
        phone: leadData.phone || null,
        ip_address: leadData.ip_address || null,
        chat_context: leadData.chat_context || null,
        valid_email: leadData.valid_email ?? null,
        session_id: leadData.session_id || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Insert error:', error);

      // Check for duplicate email
      if (error.code === '23505') {
        return jsonResponse({
          captured: false,
          error: 'Email already registered',
        });
      }

      return jsonResponse({ captured: false, error: error.message }, 500);
    }

    return jsonResponse({
      captured: true,
      leadId: data.uid || data.id,
    });
  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});

function jsonResponse(data: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
