import type { Database as SqliteDatabase } from 'better-sqlite3';

export interface GroupRecord {
  id: number;
  channelName: string;
  chatId: string;
  groupName: string;
  folderName: string;
  displayName: string | null;
  isMain: boolean;
  requiresTrigger: boolean;
  metadata: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterGroupInput {
  channelName: string;
  chatId: string;
  groupName: string;
  folderName: string;
  displayName?: string | null;
  isMain?: boolean;
  requiresTrigger?: boolean;
  metadata?: unknown;
}

interface GroupRow {
  id: number;
  channel_name: string;
  chat_id: string;
  group_name: string;
  folder_name: string;
  display_name: string | null;
  is_main: number;
  requires_trigger: number;
  metadata_json: string | null;
  created_at: string;
  updated_at: string;
}

const parseJson = (value: string | null): unknown => {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const mapGroupRow = (row: GroupRow): GroupRecord => ({
  id: row.id,
  channelName: row.channel_name,
  chatId: row.chat_id,
  groupName: row.group_name,
  folderName: row.folder_name,
  displayName: row.display_name,
  isMain: row.is_main === 1,
  requiresTrigger: row.requires_trigger === 1,
  metadata: parseJson(row.metadata_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createGroupRepo = (database: SqliteDatabase) => {
  const registerStatement = database.prepare(`
    INSERT INTO groups (
      channel_name,
      chat_id,
      group_name,
      folder_name,
      display_name,
      is_main,
      requires_trigger,
      metadata_json,
      updated_at
    ) VALUES (
      @channel_name,
      @chat_id,
      @group_name,
      @folder_name,
      @display_name,
      @is_main,
      @requires_trigger,
      @metadata_json,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(chat_id) DO UPDATE SET
      channel_name = excluded.channel_name,
      group_name = excluded.group_name,
      folder_name = excluded.folder_name,
      display_name = excluded.display_name,
      is_main = excluded.is_main,
      requires_trigger = excluded.requires_trigger,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const findByChatIdStatement = database.prepare<[string], GroupRow>(
    'SELECT * FROM groups WHERE chat_id = ? LIMIT 1',
  );
  const findByGroupNameStatement = database.prepare<[string], GroupRow>(
    'SELECT * FROM groups WHERE group_name = ? LIMIT 1',
  );
  const listAllStatement = database.prepare<[], GroupRow>(
    'SELECT * FROM groups ORDER BY created_at ASC',
  );

  return {
    register(input: RegisterGroupInput): GroupRecord {
      registerStatement.run({
        channel_name: input.channelName,
        chat_id: input.chatId,
        group_name: input.groupName,
        folder_name: input.folderName,
        display_name: input.displayName ?? null,
        is_main: input.isMain ? 1 : 0,
        requires_trigger: input.requiresTrigger ? 1 : 0,
        metadata_json: input.metadata === undefined ? null : JSON.stringify(input.metadata),
      });

      const row = findByChatIdStatement.get(input.chatId);

      if (!row) {
        throw new Error(`Failed to load group after register: ${input.chatId}`);
      }

      return mapGroupRow(row);
    },
    findByChatId(chatId: string): GroupRecord | null {
      const row = findByChatIdStatement.get(chatId);
      return row ? mapGroupRow(row) : null;
    },
    findByGroupName(groupName: string): GroupRecord | null {
      const row = findByGroupNameStatement.get(groupName);
      return row ? mapGroupRow(row) : null;
    },
    listAll(): GroupRecord[] {
      return listAllStatement.all().map(mapGroupRow);
    },
  };
};
