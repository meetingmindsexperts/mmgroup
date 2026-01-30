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
