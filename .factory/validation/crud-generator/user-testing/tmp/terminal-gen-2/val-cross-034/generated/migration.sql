-- Generated D1 migration SQL
-- Do not edit manually

CREATE TABLE IF NOT EXISTS settings (
  id TEXT NOT NULL,
  "key" TEXT NOT NULL,
  value TEXT,
  is_active INTEGER NOT NULL
);
