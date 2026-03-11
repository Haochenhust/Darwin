import type { Database as SqliteDatabase } from 'better-sqlite3';

export interface SessionRecord {
  id: number;
  groupName: string;
  sessionId: string;
  lastAssistantUuid: string | null;
  cwdPath: string | null;
  status: string;
  checkpoint: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface SaveSessionInput {
  groupName: string;
  sessionId: string;
  lastAssistantUuid?: string | null;
  cwdPath?: string | null;
  status?: string;
  checkpoint?: unknown;
}

interface SessionRow {
  id: number;
  group_name: string;
  session_id: string;
  last_assistant_uuid: string | null;
  cwd_path: string | null;
  status: string;
  checkpoint_json: string | null;
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

const mapSessionRow = (row: SessionRow): SessionRecord => ({
  id: row.id,
  groupName: row.group_name,
  sessionId: row.session_id,
  lastAssistantUuid: row.last_assistant_uuid,
  cwdPath: row.cwd_path,
  status: row.status,
  checkpoint: parseJson(row.checkpoint_json),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createSessionRepo = (database: SqliteDatabase) => {
  const saveStatement = database.prepare(`
    INSERT INTO sessions (
      group_name,
      session_id,
      last_assistant_uuid,
      cwd_path,
      status,
      checkpoint_json,
      updated_at
    ) VALUES (
      @group_name,
      @session_id,
      @last_assistant_uuid,
      @cwd_path,
      @status,
      @checkpoint_json,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(group_name) DO UPDATE SET
      session_id = excluded.session_id,
      last_assistant_uuid = excluded.last_assistant_uuid,
      cwd_path = excluded.cwd_path,
      status = excluded.status,
      checkpoint_json = excluded.checkpoint_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const findByGroupStatement = database.prepare<[string], SessionRow>(
    'SELECT * FROM sessions WHERE group_name = ? LIMIT 1',
  );
  const listAllStatement = database.prepare<[], SessionRow>(
    'SELECT * FROM sessions ORDER BY updated_at DESC',
  );
  const deleteByGroupStatement = database.prepare<[string]>(
    'DELETE FROM sessions WHERE group_name = ?',
  );

  return {
    save(input: SaveSessionInput): SessionRecord {
      saveStatement.run({
        group_name: input.groupName,
        session_id: input.sessionId,
        last_assistant_uuid: input.lastAssistantUuid ?? null,
        cwd_path: input.cwdPath ?? null,
        status: input.status ?? 'active',
        checkpoint_json: input.checkpoint === undefined ? null : JSON.stringify(input.checkpoint),
      });

      const row = findByGroupStatement.get(input.groupName);

      if (!row) {
        throw new Error(`Failed to load session for group ${input.groupName}`);
      }

      return mapSessionRow(row);
    },
    findByGroup(groupName: string): SessionRecord | null {
      const row = findByGroupStatement.get(groupName);
      return row ? mapSessionRow(row) : null;
    },
    listAll(): SessionRecord[] {
      return listAllStatement.all().map(mapSessionRow);
    },
    deleteByGroup(groupName: string): void {
      deleteByGroupStatement.run(groupName);
    },
  };
};
