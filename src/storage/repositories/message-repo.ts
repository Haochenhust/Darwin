import type { Database as SqliteDatabase } from 'better-sqlite3';

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'received' | 'processing' | 'done' | 'failed';
export type MessageTriggerSource = 'chat' | 'task' | 'system';

export interface MessageRecord {
  id: number;
  channelName: string;
  chatId: string;
  groupName: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  triggerSource: MessageTriggerSource;
  eventId: string | null;
  messageId: string | null;
  senderId: string | null;
  senderName: string | null;
  messageType: string;
  threadRootId: string | null;
  parentId: string | null;
  sessionId: string | null;
  textContent: string | null;
  rawPayload: unknown;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  processedAt: string | null;
}

export interface InsertMessageInput {
  channelName: string;
  chatId: string;
  groupName?: string | null;
  direction: MessageDirection;
  status?: MessageStatus;
  triggerSource?: MessageTriggerSource;
  eventId?: string | null;
  messageId?: string | null;
  senderId?: string | null;
  senderName?: string | null;
  messageType?: string;
  threadRootId?: string | null;
  parentId?: string | null;
  sessionId?: string | null;
  textContent?: string | null;
  rawPayload: unknown;
  errorMessage?: string | null;
}

interface MessageRow {
  id: number;
  channel_name: string;
  chat_id: string;
  group_name: string | null;
  direction: MessageDirection;
  status: MessageStatus;
  trigger_source: MessageTriggerSource;
  event_id: string | null;
  message_id: string | null;
  sender_id: string | null;
  sender_name: string | null;
  message_type: string;
  thread_root_id: string | null;
  parent_id: string | null;
  session_id: string | null;
  text_content: string | null;
  raw_payload: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
}

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const mapMessageRow = (row: MessageRow): MessageRecord => ({
  id: row.id,
  channelName: row.channel_name,
  chatId: row.chat_id,
  groupName: row.group_name,
  direction: row.direction,
  status: row.status,
  triggerSource: row.trigger_source,
  eventId: row.event_id,
  messageId: row.message_id,
  senderId: row.sender_id,
  senderName: row.sender_name,
  messageType: row.message_type,
  threadRootId: row.thread_root_id,
  parentId: row.parent_id,
  sessionId: row.session_id,
  textContent: row.text_content,
  rawPayload: parseJson(row.raw_payload),
  errorMessage: row.error_message,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  processedAt: row.processed_at,
});

const serializePayload = (payload: unknown): string => {
  if (typeof payload === 'string') {
    return payload;
  }

  return JSON.stringify(payload);
};

export const createMessageRepo = (database: SqliteDatabase) => {
  const insertStatement = database.prepare(`
    INSERT INTO messages (
      channel_name,
      chat_id,
      group_name,
      direction,
      status,
      trigger_source,
      event_id,
      message_id,
      sender_id,
      sender_name,
      message_type,
      thread_root_id,
      parent_id,
      session_id,
      text_content,
      raw_payload,
      error_message
    ) VALUES (
      @channel_name,
      @chat_id,
      @group_name,
      @direction,
      @status,
      @trigger_source,
      @event_id,
      @message_id,
      @sender_id,
      @sender_name,
      @message_type,
      @thread_root_id,
      @parent_id,
      @session_id,
      @text_content,
      @raw_payload,
      @error_message
    )
  `);

  const findByIdStatement = database.prepare<[number], MessageRow>(
    'SELECT * FROM messages WHERE id = ? LIMIT 1',
  );
  const findByEventIdStatement = database.prepare<[string, string], MessageRow>(
    'SELECT * FROM messages WHERE channel_name = ? AND event_id = ? LIMIT 1',
  );
  const findByMessageIdStatement = database.prepare<[string, MessageDirection, string], MessageRow>(
    'SELECT * FROM messages WHERE channel_name = ? AND direction = ? AND message_id = ? LIMIT 1',
  );
  const queryByGroupStatement = database.prepare<[string, number], MessageRow>(`
    SELECT * FROM messages
    WHERE group_name = ?
    ORDER BY created_at DESC
    LIMIT ?
  `);
  const listByStatusStatement = database.prepare<[MessageStatus, number], MessageRow>(`
    SELECT * FROM messages
    WHERE status = ?
    ORDER BY created_at ASC
    LIMIT ?
  `);
  const markProcessingStatement = database.prepare(`
    UPDATE messages
    SET status = 'processing',
        session_id = @session_id,
        error_message = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);
  const markDoneStatement = database.prepare(`
    UPDATE messages
    SET status = 'done',
        processed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const markFailedStatement = database.prepare(`
    UPDATE messages
    SET status = 'failed',
        error_message = @error_message,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `);

  return {
    insert(input: InsertMessageInput): MessageRecord {
      const result = insertStatement.run({
        channel_name: input.channelName,
        chat_id: input.chatId,
        group_name: input.groupName ?? null,
        direction: input.direction,
        status: input.status ?? 'received',
        trigger_source: input.triggerSource ?? 'chat',
        event_id: input.eventId ?? null,
        message_id: input.messageId ?? null,
        sender_id: input.senderId ?? null,
        sender_name: input.senderName ?? null,
        message_type: input.messageType ?? 'text',
        thread_root_id: input.threadRootId ?? null,
        parent_id: input.parentId ?? null,
        session_id: input.sessionId ?? null,
        text_content: input.textContent ?? null,
        raw_payload: serializePayload(input.rawPayload),
        error_message: input.errorMessage ?? null,
      });

      const row = findByIdStatement.get(Number(result.lastInsertRowid));

      if (!row) {
        throw new Error('Failed to load message after insert');
      }

      return mapMessageRow(row);
    },
    findByEventId(channelName: string, eventId: string): MessageRecord | null {
      const row = findByEventIdStatement.get(channelName, eventId);
      return row ? mapMessageRow(row) : null;
    },
    findByMessageId(
      channelName: string,
      direction: MessageDirection,
      messageId: string,
    ): MessageRecord | null {
      const row = findByMessageIdStatement.get(channelName, direction, messageId);
      return row ? mapMessageRow(row) : null;
    },
    queryByGroup(groupName: string, limit = 50): MessageRecord[] {
      return queryByGroupStatement.all(groupName, limit).map(mapMessageRow);
    },
    listByStatus(status: MessageStatus, limit = 100): MessageRecord[] {
      return listByStatusStatement.all(status, limit).map(mapMessageRow);
    },
    markProcessing(id: number, sessionId?: string | null): void {
      markProcessingStatement.run({
        id,
        session_id: sessionId ?? null,
      });
    },
    markDone(id: number): void {
      markDoneStatement.run(id);
    },
    markFailed(id: number, errorMessage: string): void {
      markFailedStatement.run({
        id,
        error_message: errorMessage,
      });
    },
  };
};
