/**
 * Meeting Minds Group - RAG Chatbot API
 *
 * Endpoints:
 *   POST /chat           - Send a message and get AI response
 *   POST /chat/stream    - Streaming chat response
 *   POST /ingest         - Add content to knowledge base
 *   POST /ingest/bulk    - Bulk add multiple documents
 *   GET  /stats          - Get vector store statistics
 *   GET  /analytics      - Chat analytics dashboard
 *   GET  /analytics/export - Export chat logs as CSV
 *   GET  /health         - Health check
 *   GET  /widget.js      - Embeddable chat widget
 */

import type { Env } from './types';
import { handleChat, handleChatStream } from './routes/chat';
import { handleIngest, handleBulkIngest, handleStats } from './routes/ingest';
import { handleWidget } from './routes/widget';
import { handleAnalytics, handleAnalyticsExport } from './routes/analytics';
import { handleCors, addCorsHeaders } from './utils/cors';

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const allowedOrigin = env.ALLOWED_ORIGIN || 'https://meetingmindsgroup.com';

    // Handle CORS preflight
    const corsResponse = handleCors(request, allowedOrigin);
    if (corsResponse) {
      return corsResponse;
    }

    let response: Response;

    try {
      // Route handling
      switch (true) {
        // Health check
        case path === '/' || path === '/health':
          response = Response.json({ status: 'ok', service: 'mmgroup-chat' });
          break;

        // Chat endpoints
        case path === '/chat' && request.method === 'POST':
          response = await handleChat(request, env);
          break;

        case path === '/chat/stream' && request.method === 'POST':
          response = await handleChatStream(request, env);
          break;

        // Ingest endpoints
        case path === '/ingest' && request.method === 'POST':
          response = await handleIngest(request, env);
          break;

        case path === '/ingest/bulk' && request.method === 'POST':
          response = await handleBulkIngest(request, env);
          break;

        // Stats endpoint
        case path === '/stats' && request.method === 'GET':
          response = await handleStats(request, env);
          break;

        // Analytics endpoints
        case path === '/analytics' && request.method === 'GET':
          response = await handleAnalytics(request, env);
          break;

        case path === '/analytics/export' && request.method === 'GET':
          response = await handleAnalyticsExport(request, env);
          break;

        // Widget endpoint
        case path === '/widget.js' && request.method === 'GET':
          response = handleWidget(request, allowedOrigin);
          break;

        // 404 for unknown routes
        default:
          response = Response.json(
            { error: 'Not found', path },
            { status: 404 }
          );
      }
    } catch (error) {
      console.error('Unhandled error:', error);
      response = Response.json(
        { error: 'Internal server error' },
        { status: 500 }
      );
    }

    // Add CORS headers to all responses
    return addCorsHeaders(response, request, allowedOrigin);
  },
} satisfies ExportedHandler<Env>;
