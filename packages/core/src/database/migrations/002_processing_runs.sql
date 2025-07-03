CREATE TABLE processing_runs (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL, -- 'in_progress', 'completed', 'failed'
  last_processed_message_id TEXT,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  error_message TEXT,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

CREATE INDEX idx_processing_runs_session_id ON processing_runs(session_id);