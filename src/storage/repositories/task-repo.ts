import { randomUUID } from 'node:crypto';

import type { Database as SqliteDatabase } from 'better-sqlite3';

export type TaskScheduleType = 'cron' | 'interval' | 'once';
export type TaskStatus = 'active' | 'paused' | 'running' | 'done' | 'failed';

export interface TaskRecord {
  id: number;
  taskId: string;
  channelName: string;
  chatId: string;
  groupName: string;
  title: string;
  prompt: string;
  scheduleType: TaskScheduleType;
  scheduleValue: string;
  status: TaskStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdBy: string | null;
  metadata: unknown;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  taskId?: string;
  channelName: string;
  chatId: string;
  groupName: string;
  title: string;
  prompt: string;
  scheduleType: TaskScheduleType;
  scheduleValue: string;
  status?: TaskStatus;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  createdBy?: string | null;
  metadata?: unknown;
  lastError?: string | null;
}

interface TaskRow {
  id: number;
  task_id: string;
  channel_name: string;
  chat_id: string;
  group_name: string;
  title: string;
  prompt: string;
  schedule_type: TaskScheduleType;
  schedule_value: string;
  status: TaskStatus;
  next_run_at: string | null;
  last_run_at: string | null;
  created_by: string | null;
  metadata_json: string | null;
  last_error: string | null;
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

const mapTaskRow = (row: TaskRow): TaskRecord => ({
  id: row.id,
  taskId: row.task_id,
  channelName: row.channel_name,
  chatId: row.chat_id,
  groupName: row.group_name,
  title: row.title,
  prompt: row.prompt,
  scheduleType: row.schedule_type,
  scheduleValue: row.schedule_value,
  status: row.status,
  nextRunAt: row.next_run_at,
  lastRunAt: row.last_run_at,
  createdBy: row.created_by,
  metadata: parseJson(row.metadata_json),
  lastError: row.last_error,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export const createTaskRepo = (database: SqliteDatabase) => {
  const createStatement = database.prepare(`
    INSERT INTO tasks (
      task_id,
      channel_name,
      chat_id,
      group_name,
      title,
      prompt,
      schedule_type,
      schedule_value,
      status,
      next_run_at,
      last_run_at,
      created_by,
      metadata_json,
      last_error
    ) VALUES (
      @task_id,
      @channel_name,
      @chat_id,
      @group_name,
      @title,
      @prompt,
      @schedule_type,
      @schedule_value,
      @status,
      @next_run_at,
      @last_run_at,
      @created_by,
      @metadata_json,
      @last_error
    )
  `);

  const findByTaskIdStatement = database.prepare<[string], TaskRow>(
    'SELECT * FROM tasks WHERE task_id = ? LIMIT 1',
  );
  const findDueStatement = database.prepare<[string, number], TaskRow>(`
    SELECT * FROM tasks
    WHERE status IN ('active', 'running')
      AND next_run_at IS NOT NULL
      AND next_run_at <= ?
    ORDER BY next_run_at ASC
    LIMIT ?
  `);
  const listByGroupStatement = database.prepare<[string], TaskRow>(`
    SELECT * FROM tasks
    WHERE group_name = ?
    ORDER BY created_at DESC
  `);
  const updateStatusStatement = database.prepare(`
    UPDATE tasks
    SET status = @status,
        last_error = @last_error,
        updated_at = CURRENT_TIMESTAMP
    WHERE task_id = @task_id
  `);
  const scheduleNextStatement = database.prepare(`
    UPDATE tasks
    SET next_run_at = @next_run_at,
        last_run_at = @last_run_at,
        updated_at = CURRENT_TIMESTAMP
    WHERE task_id = @task_id
  `);
  const deleteStatement = database.prepare<[string]>(
    'DELETE FROM tasks WHERE task_id = ?',
  );

  return {
    create(input: CreateTaskInput): TaskRecord {
      const taskId = input.taskId ?? randomUUID();

      createStatement.run({
        task_id: taskId,
        channel_name: input.channelName,
        chat_id: input.chatId,
        group_name: input.groupName,
        title: input.title,
        prompt: input.prompt,
        schedule_type: input.scheduleType,
        schedule_value: input.scheduleValue,
        status: input.status ?? 'active',
        next_run_at: input.nextRunAt ?? null,
        last_run_at: input.lastRunAt ?? null,
        created_by: input.createdBy ?? null,
        metadata_json: input.metadata === undefined ? null : JSON.stringify(input.metadata),
        last_error: input.lastError ?? null,
      });

      const row = findByTaskIdStatement.get(taskId);

      if (!row) {
        throw new Error(`Failed to load task ${taskId} after create`);
      }

      return mapTaskRow(row);
    },
    findByTaskId(taskId: string): TaskRecord | null {
      const row = findByTaskIdStatement.get(taskId);
      return row ? mapTaskRow(row) : null;
    },
    findDue(now: string, limit = 50): TaskRecord[] {
      return findDueStatement.all(now, limit).map(mapTaskRow);
    },
    listByGroup(groupName: string): TaskRecord[] {
      return listByGroupStatement.all(groupName).map(mapTaskRow);
    },
    updateStatus(taskId: string, status: TaskStatus, lastError?: string | null): void {
      updateStatusStatement.run({
        task_id: taskId,
        status,
        last_error: lastError ?? null,
      });
    },
    updateNextRun(taskId: string, nextRunAt: string | null, lastRunAt: string | null): void {
      scheduleNextStatement.run({
        task_id: taskId,
        next_run_at: nextRunAt,
        last_run_at: lastRunAt,
      });
    },
    delete(taskId: string): void {
      deleteStatement.run(taskId);
    },
  };
};
