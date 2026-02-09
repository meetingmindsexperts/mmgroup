/**
 * Knowledge Gap Detection
 *
 * Detects questions the chatbot can't answer well (low RAG scores),
 * logs them to D1, and provides analytics endpoints to review and resolve gaps.
 */

import type { Env } from '../types';
import { hasContactInfo } from '../utils/leadDetection';

const GREETING_PATTERN = /^(hi|hello|hey|hiya|howdy|good\s+(morning|afternoon|evening)|thanks|thank\s+you|ok|okay|yes|no|bye|goodbye)\b/i;
const MIN_MESSAGE_LENGTH = 15;

/**
 * Normalize question text for deduplication.
 * Lowercase, trim, strip punctuation, collapse whitespace.
 */
function normalizeQuestion(question: string): string {
  return question
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Check if a message is a greeting or trivial input (not worth logging as a gap).
 */
function isNoise(message: string): boolean {
  if (message.length < MIN_MESSAGE_LENGTH) return true;
  if (GREETING_PATTERN.test(message.trim())) return true;
  if (hasContactInfo(message)) return true;
  return false;
}

/**
 * Log a knowledge gap to D1. Non-blocking — errors are logged but never thrown.
 * Deduplicates by normalized question text: increments count if exists, inserts if new.
 */
export async function logKnowledgeGap(
  env: Env,
  entry: { question: string; bestScore: number; sessionId: string }
): Promise<void> {
  try {
    const normalized = normalizeQuestion(entry.question);

    const existing = (await env.ANALYTICS_DB.prepare(
      `SELECT id, occurrence_count, sample_sessions, best_score
       FROM knowledge_gaps
       WHERE question_normalized = ? AND status = 'active'`
    )
      .bind(normalized)
      .first()) as {
      id: number;
      occurrence_count: number;
      sample_sessions: string | null;
      best_score: number;
    } | null;

    if (existing) {
      const sessions: string[] = JSON.parse(existing.sample_sessions || '[]');
      if (!sessions.includes(entry.sessionId) && sessions.length < 5) {
        sessions.push(entry.sessionId);
      }

      await env.ANALYTICS_DB.prepare(
        `UPDATE knowledge_gaps
         SET occurrence_count = occurrence_count + 1,
             last_seen_at = datetime('now'),
             sample_sessions = ?,
             best_score = MAX(best_score, ?)
         WHERE id = ?`
      )
        .bind(JSON.stringify(sessions), entry.bestScore, existing.id)
        .run();
    } else {
      await env.ANALYTICS_DB.prepare(
        `INSERT INTO knowledge_gaps (question, question_normalized, best_score, sample_sessions)
         VALUES (?, ?, ?, ?)`
      )
        .bind(
          entry.question.slice(0, 500),
          normalized,
          entry.bestScore,
          JSON.stringify([entry.sessionId])
        )
        .run();
    }
  } catch (error) {
    console.error('Failed to log knowledge gap:', error);
  }
}

/**
 * Determine whether a chat interaction represents a knowledge gap.
 */
export function isKnowledgeGap(
  message: string,
  searchResults: { score: number }[],
  leadCaptureInProgress: boolean
): boolean {
  if (leadCaptureInProgress) return false;
  if (isNoise(message)) return false;
  if (searchResults.length === 0) return true;
  return searchResults.every((r) => r.score <= 0.3);
}

// ── Analytics Endpoints ─────────────────────────────────────────────

/**
 * GET /analytics/gaps?status=active&limit=50
 */
export async function handleGapsAnalytics(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get('status') || 'active';
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 200);

    const result = await env.ANALYTICS_DB.prepare(
      `SELECT id, question, best_score, occurrence_count,
              first_seen_at, last_seen_at, sample_sessions,
              status, resolved_at, resolution_note
       FROM knowledge_gaps
       WHERE status = ?
       ORDER BY occurrence_count DESC, last_seen_at DESC
       LIMIT ?`
    )
      .bind(status, limit)
      .all();

    return Response.json({
      status,
      gaps: result.results || [],
      total: result.results?.length || 0,
    });
  } catch (error) {
    console.error('Gaps analytics error:', error);
    return Response.json({ error: 'Failed to get knowledge gaps' }, { status: 500 });
  }
}

/**
 * GET /analytics/gaps/summary
 */
export async function handleGapsSummary(_request: Request, env: Env): Promise<Response> {
  try {
    const summary = await env.ANALYTICS_DB.prepare(
      `SELECT
         COUNT(*) as total_gaps,
         COUNT(CASE WHEN status = 'active' THEN 1 END) as active_gaps,
         COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_gaps,
         SUM(occurrence_count) as total_occurrences,
         ROUND(AVG(best_score), 3) as avg_score
       FROM knowledge_gaps`
    ).first();

    const topGaps = await env.ANALYTICS_DB.prepare(
      `SELECT question, occurrence_count, best_score, last_seen_at
       FROM knowledge_gaps
       WHERE status = 'active'
       ORDER BY occurrence_count DESC
       LIMIT 5`
    ).all();

    return Response.json({
      summary: summary || {},
      topGaps: topGaps.results || [],
    });
  } catch (error) {
    console.error('Gaps summary error:', error);
    return Response.json({ error: 'Failed to get gaps summary' }, { status: 500 });
  }
}

/**
 * PATCH /analytics/gaps/:id/resolve
 */
export async function handleResolveGap(
  request: Request,
  env: Env,
  gapId: number
): Promise<Response> {
  try {
    const body = (await request.json()) as { note?: string };

    await env.ANALYTICS_DB.prepare(
      `UPDATE knowledge_gaps
       SET status = 'resolved', resolved_at = datetime('now'), resolution_note = ?
       WHERE id = ?`
    )
      .bind(body.note || null, gapId)
      .run();

    return Response.json({ success: true });
  } catch (error) {
    console.error('Resolve gap error:', error);
    return Response.json({ error: 'Failed to resolve gap' }, { status: 500 });
  }
}
