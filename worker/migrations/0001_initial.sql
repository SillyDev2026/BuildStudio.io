CREATE TABLE IF NOT EXISTS users (github_id TEXT PRIMARY KEY,login TEXT NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_tickets (ticket_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(github_id),expires_at INTEGER NOT NULL,used_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_tickets_expiration ON oauth_tickets(expires_at);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(github_id),expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(github_id),name TEXT NOT NULL,doc_json TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id,updated_at DESC);
