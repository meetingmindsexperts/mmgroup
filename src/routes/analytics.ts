import type { Env } from '../types';

export interface ChatLogEntry {
  session_id: string;
  message: string;
  response: string;
  response_time_ms: number;
  context_chunks: number;
  origin: string | null;
  user_agent: string | null;
}

// Log a chat interaction
export async function logChat(env: Env, entry: ChatLogEntry): Promise<void> {
  try {
    await env.ANALYTICS_DB.prepare(
      `INSERT INTO chat_logs (session_id, message, response, response_time_ms, context_chunks, origin, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        entry.session_id,
        entry.message.slice(0, 500), // Truncate long messages
        entry.response.slice(0, 1000), // Truncate long responses
        entry.response_time_ms,
        entry.context_chunks,
        entry.origin,
        entry.user_agent
      )
      .run();
  } catch (error) {
    console.error('Failed to log chat:', error);
    // Don't throw - analytics should not break chat
  }
}

// Get analytics dashboard data
export async function handleAnalytics(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '7');

    // Get summary stats
    const summaryResult = await env.ANALYTICS_DB.prepare(
      `SELECT
        COUNT(*) as total_chats,
        COUNT(DISTINCT session_id) as unique_sessions,
        ROUND(AVG(response_time_ms), 0) as avg_response_time,
        MIN(created_at) as first_chat,
        MAX(created_at) as last_chat
       FROM chat_logs
       WHERE created_at >= datetime('now', '-' || ? || ' days')`
    )
      .bind(days)
      .first();

    // Get daily breakdown
    const dailyResult = await env.ANALYTICS_DB.prepare(
      `SELECT
        date(created_at) as date,
        COUNT(*) as chats,
        COUNT(DISTINCT session_id) as sessions,
        ROUND(AVG(response_time_ms), 0) as avg_response_time
       FROM chat_logs
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       GROUP BY date(created_at)
       ORDER BY date DESC`
    )
      .bind(days)
      .all();

    // Get top questions (most common message patterns)
    const topQuestionsResult = await env.ANALYTICS_DB.prepare(
      `SELECT
        message,
        COUNT(*) as count
       FROM chat_logs
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       GROUP BY message
       ORDER BY count DESC
       LIMIT 10`
    )
      .bind(days)
      .all();

    // Get recent chats
    const recentResult = await env.ANALYTICS_DB.prepare(
      `SELECT
        session_id,
        message,
        response,
        response_time_ms,
        created_at
       FROM chat_logs
       ORDER BY created_at DESC
       LIMIT 20`
    ).all();

    // Get knowledge gap summary
    const gapSummary = await env.ANALYTICS_DB.prepare(
      `SELECT
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_gaps,
        SUM(CASE WHEN status = 'active' THEN occurrence_count ELSE 0 END) as total_gap_occurrences
       FROM knowledge_gaps`
    ).first();

    return Response.json({
      period: `${days} days`,
      summary: summaryResult || {
        total_chats: 0,
        unique_sessions: 0,
        avg_response_time: 0,
      },
      knowledgeGaps: gapSummary || { active_gaps: 0, total_gap_occurrences: 0 },
      daily: dailyResult.results || [],
      topQuestions: topQuestionsResult.results || [],
      recentChats: recentResult.results || [],
    });
  } catch (error) {
    console.error('Analytics error:', error);
    return Response.json(
      { error: 'Failed to get analytics', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

// Export chat logs as CSV
export async function handleAnalyticsExport(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    const result = await env.ANALYTICS_DB.prepare(
      `SELECT
        session_id,
        message,
        response,
        response_time_ms,
        context_chunks,
        origin,
        created_at
       FROM chat_logs
       WHERE created_at >= datetime('now', '-' || ? || ' days')
       ORDER BY created_at DESC`
    )
      .bind(days)
      .all();

    // Build CSV
    const headers = ['session_id', 'message', 'response', 'response_time_ms', 'context_chunks', 'origin', 'created_at'];
    const rows = result.results.map((row: Record<string, unknown>) =>
      headers
        .map((h) => {
          const val = String(row[h] || '');
          // Escape quotes and wrap in quotes if contains comma/newline
          if (val.includes(',') || val.includes('\n') || val.includes('"')) {
            return `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        })
        .join(',')
    );

    const csv = [headers.join(','), ...rows].join('\n');

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="chat-logs-${days}days.csv"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ error: 'Failed to export' }, { status: 500 });
  }
}
