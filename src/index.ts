/**
 * Meeting Minds Group - RAG Chatbot API
 *
 * Endpoints:
 *   POST   /chat           - Send a message and get AI response
 *   POST   /chat/stream    - Streaming chat response
 *   POST   /ingest         - Add content to knowledge base
 *   POST   /ingest/bulk    - Bulk add multiple documents
 *   GET    /stats          - Get vector store statistics
 *   DELETE /clear          - Clear all vectors from store
 *   GET    /analytics      - Chat analytics dashboard
 *   GET    /analytics/export - Export chat logs as CSV
 *   GET    /analytics/gaps  - Knowledge gaps (unanswered questions)
 *   GET    /analytics/gaps/summary - Knowledge gaps summary
 *   PATCH  /analytics/gaps/:id/resolve - Mark a gap as resolved
 *   GET    /health         - Health check
 *   GET    /widget.js      - Embeddable chat widget
 */

import type { Env } from './types';
import { handleChat, handleChatStream } from './routes/chat';
import { handleIngest, handleBulkIngest, handleStats, handleClear } from './routes/ingest';
import { handleWidget } from './routes/widget';
import { handleAnalytics, handleAnalyticsExport } from './routes/analytics';
import { handleGapsAnalytics, handleGapsSummary, handleResolveGap } from './routes/knowledgeGaps';
import { handleCors, addCorsHeaders } from './utils/cors';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
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
          response = await handleChat(request, env, ctx);
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

        // Clear vectors endpoint
        case path === '/clear' && request.method === 'DELETE':
          response = await handleClear(request, env);
          break;

        // Knowledge gap endpoints (before /analytics to match longer paths first)
        case path === '/analytics/gaps/summary' && request.method === 'GET':
          response = await handleGapsSummary(request, env);
          break;

        case path === '/analytics/gaps' && request.method === 'GET':
          response = await handleGapsAnalytics(request, env);
          break;

        case path.startsWith('/analytics/gaps/') && path.endsWith('/resolve') && request.method === 'PATCH': {
          const gapId = parseInt(path.split('/')[3], 10);
          response = await handleResolveGap(request, env, gapId);
          break;
        }

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
