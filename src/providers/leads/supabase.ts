import type { LeadData, LeadCaptureResult, EmailValidationResult } from '../../types';
import type { LeadsProvider } from './types';
import { validateEmail as localValidateEmail } from '../../utils/leadDetection';

/**
 * Supabase-based leads provider
 *
 * Stores leads via secure edge function that validates the chatbot API key.
 * This ensures only authorized requests from the chatbot can insert leads.
 */
export class SupabaseLeadsProvider implements LeadsProvider {
  private supabaseUrl: string;
  private anonKey: string;
  private chatbotApiKey: string;

  constructor(supabaseUrl: string, anonKey: string, chatbotApiKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.anonKey = anonKey;
    this.chatbotApiKey = chatbotApiKey;
  }

  /**
   * Validate email via Supabase edge function
   * Falls back to local validation if edge function is unavailable
   */
  async validateEmail(email: string): Promise<EmailValidationResult> {
    try {
      // Try Supabase edge function first
      const response = await fetch(`${this.supabaseUrl}/functions/v1/validate-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.anonKey}`,
        },
        body: JSON.stringify({ email }),
      });

      if (response.ok) {
        const result = await response.json();
        return result as EmailValidationResult;
      }

      // If edge function fails, fall back to local validation
      console.warn('Supabase edge function failed, using local validation');
      return localValidateEmail(email);
    } catch (error) {
      console.error('Email validation error:', error);
      // Fall back to local validation
      return localValidateEmail(email);
    }
  }

  /**
   * Save a lead via secure edge function
   * The edge function validates the chatbot API key before inserting
   */
  async saveLead(lead: LeadData): Promise<LeadCaptureResult> {
    try {
      const response = await fetch(`${this.supabaseUrl}/functions/v1/capture-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-chatbot-key': this.chatbotApiKey,
        },
        body: JSON.stringify({
          name: lead.name || null,
          email: lead.email,
          phone: lead.phone || null,
          ip_address: lead.ip_address || null,
          chat_context: lead.chat_context || null,
          valid_email: lead.valid_email ?? null,
          session_id: lead.session_id || null,
        }),
      });

      const data = (await response.json()) as {
        captured?: boolean;
        leadId?: string;
        error?: string;
      };

      if (!response.ok) {
        console.error('Lead capture error:', data);

        if (data.error === 'Email already registered') {
          return {
            captured: false,
            validationMessage: 'This email has already been registered',
          };
        }

        return {
          captured: false,
          validationMessage: data.error || 'Failed to save lead information',
        };
      }

      return {
        captured: data.captured ?? false,
        leadId: data.leadId,
        emailValid: lead.valid_email,
      };
    } catch (error) {
      console.error('Lead save error:', error);
      return {
        captured: false,
        validationMessage: 'An error occurred while saving your information',
      };
    }
  }
}
