import type { Database as SqliteDatabase } from 'better-sqlite3';

export interface StateRecord<T = unknown> {
  scope: string;
  key: string;
  value: T;
  updatedAt: string;
}

interface StateRow {
  scope: string;
  key: string;
  value: string;
  updated_at: string;
}

const parseJson = <T>(value: string): T => {
  return JSON.parse(value) as T;
};

export const createStateRepo = (database: SqliteDatabase) => {
  const getStatement = database.prepare<[string, string], StateRow>(
    'SELECT * FROM state WHERE scope = ? AND key = ? LIMIT 1',
  );
  const setStatement = database.prepare(`
    INSERT INTO state (scope, key, value, updated_at)
    VALUES (@scope, @key, @value, CURRENT_TIMESTAMP)
    ON CONFLICT(scope, key) DO UPDATE SET
      value = excluded.value,
      updated_at = CURRENT_TIMESTAMP
  `);
  const deleteStatement = database.prepare<[string, string]>(
    'DELETE FROM state WHERE scope = ? AND key = ?',
  );
  const listByScopeStatement = database.prepare<[string], StateRow>(
    'SELECT * FROM state WHERE scope = ? ORDER BY key ASC',
  );

  return {
    get<T>(scope: string, key: string): StateRecord<T> | null {
      const row = getStatement.get(scope, key);

      if (!row) {
        return null;
      }

      return {
        scope: row.scope,
        key: row.key,
        value: parseJson<T>(row.value),
        updatedAt: row.updated_at,
      };
    },
    set(scope: string, key: string, value: unknown): void {
      setStatement.run({
        scope,
        key,
        value: JSON.stringify(value),
      });
    },
    delete(scope: string, key: string): void {
      deleteStatement.run(scope, key);
    },
    listByScope<T>(scope: string): StateRecord<T>[] {
      return listByScopeStatement.all(scope).map((row: StateRow) => ({
        scope: row.scope,
        key: row.key,
        value: parseJson<T>(row.value),
        updatedAt: row.updated_at,
      }));
    },
  };
};
