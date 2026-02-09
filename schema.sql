-- Chat Analytics Schema

-- Chat logs table
CREATE TABLE IF NOT EXISTS chat_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  message TEXT NOT NULL,
  response TEXT,
  response_time_ms INTEGER,
  context_chunks INTEGER DEFAULT 0,
  origin TEXT,
  user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_chat_logs_session ON chat_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_logs_created ON chat_logs(created_at);

-- Daily stats table (aggregated for performance)
CREATE TABLE IF NOT EXISTS daily_stats (
  date TEXT PRIMARY KEY,
  total_chats INTEGER DEFAULT 0,
  unique_sessions INTEGER DEFAULT 0,
  avg_response_time_ms REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Knowledge gaps table - tracks questions the chatbot can't answer well
CREATE TABLE IF NOT EXISTS knowledge_gaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  question_normalized TEXT NOT NULL,
  best_score REAL DEFAULT 0,
  occurrence_count INTEGER DEFAULT 1,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_seen_at TEXT DEFAULT (datetime('now')),
  sample_sessions TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'resolved')),
  resolved_at TEXT,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_normalized ON knowledge_gaps(question_normalized);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_status ON knowledge_gaps(status);
CREATE INDEX IF NOT EXISTS idx_knowledge_gaps_occurrence ON knowledge_gaps(occurrence_count DESC);
