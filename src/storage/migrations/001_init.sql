CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  group_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  status TEXT NOT NULL CHECK (status IN ('received', 'processing', 'done', 'failed')) DEFAULT 'received',
  trigger_source TEXT NOT NULL DEFAULT 'chat',
  event_id TEXT,
  message_id TEXT,
  sender_id TEXT,
  sender_name TEXT,
  message_type TEXT NOT NULL DEFAULT 'text',
  thread_root_id TEXT,
  parent_id TEXT,
  session_id TEXT,
  text_content TEXT,
  raw_payload TEXT NOT NULL,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_status_created_at
  ON messages (status, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_group_created_at
  ON messages (group_name, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created_at
  ON messages (chat_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_session_id
  ON messages (session_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_event_unique
  ON messages (channel_name, event_id)
  WHERE event_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_direction_message_unique
  ON messages (channel_name, direction, message_id)
  WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  channel_name TEXT NOT NULL,
  chat_id TEXT NOT NULL UNIQUE,
  group_name TEXT NOT NULL UNIQUE,
  folder_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_main INTEGER NOT NULL DEFAULT 0,
  requires_trigger INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_groups_channel_chat
  ON groups (channel_name, chat_id);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_name TEXT NOT NULL UNIQUE,
  session_id TEXT NOT NULL,
  last_assistant_uuid TEXT,
  cwd_path TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  checkpoint_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sessions_status_updated_at
  ON sessions (status, updated_at);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL UNIQUE,
  channel_name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schedule_type TEXT NOT NULL CHECK (schedule_type IN ('cron', 'interval', 'once')),
  schedule_value TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'running', 'done', 'failed')) DEFAULT 'active',
  next_run_at TEXT,
  last_run_at TEXT,
  created_by TEXT,
  metadata_json TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_lookup
  ON tasks (status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_tasks_group_status
  ON tasks (group_name, status);

CREATE TABLE IF NOT EXISTS state (
  scope TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (scope, key)
);
