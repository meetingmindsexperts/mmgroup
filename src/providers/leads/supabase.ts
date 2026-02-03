import type { LeadData, LeadCaptureResult, EmailValidationResult } from '../../types';
import type { LeadsProvider } from './types';
import { validateEmail as localValidateEmail } from '../../utils/leadDetection';

/**
 * Supabase-based leads provider
 *
 * Stores leads in the mmg_chat_leads table and validates emails
 * via edge function or local validation as fallback.
 */
export class SupabaseLeadsProvider implements LeadsProvider {
  private supabaseUrl: string;
  private anonKey: string;

  constructor(supabaseUrl: string, anonKey: string) {
    this.supabaseUrl = supabaseUrl;
    this.anonKey = anonKey;
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
   * Save a lead to the mmg_chat_leads table
   */
  async saveLead(lead: LeadData): Promise<LeadCaptureResult> {
    try {
      const response = await fetch(`${this.supabaseUrl}/rest/v1/mmg_chat_leads`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.anonKey,
          Authorization: `Bearer ${this.anonKey}`,
          Prefer: 'return=representation',
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

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Supabase lead save error:', errorText);

        // Check for duplicate email error
        if (response.status === 409 || errorText.includes('duplicate')) {
          return {
            captured: false,
            validationMessage: 'This email has already been registered',
          };
        }

        return {
          captured: false,
          validationMessage: 'Failed to save lead information',
        };
      }

      const data = await response.json();
      const savedLead = Array.isArray(data) ? data[0] : data;

      return {
        captured: true,
        leadId: savedLead.uid || savedLead.id?.toString(),
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
