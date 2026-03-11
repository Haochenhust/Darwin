CREATE TABLE IF NOT EXISTS thread_bindings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  root_id TEXT NOT NULL,
  parent_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_thread_bindings_chat_message
  ON thread_bindings (chat_id, message_id);

CREATE INDEX IF NOT EXISTS idx_thread_bindings_root_id
  ON thread_bindings (chat_id, root_id);
