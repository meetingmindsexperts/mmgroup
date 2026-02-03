import type { LeadData, LeadCaptureResult, EmailValidationResult } from '../../types';

export interface LeadsProvider {
  /**
   * Validate an email address (format + disposable check)
   */
  validateEmail(email: string): Promise<EmailValidationResult>;

  /**
   * Save a lead to the database
   */
  saveLead(lead: LeadData): Promise<LeadCaptureResult>;
}
