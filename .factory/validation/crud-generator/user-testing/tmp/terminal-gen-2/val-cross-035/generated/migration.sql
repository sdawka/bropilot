-- Generated D1 migration SQL
-- Do not edit manually

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  user_id TEXT,
  workspace_id TEXT NOT NULL,
  category_id TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT NOT NULL
);
