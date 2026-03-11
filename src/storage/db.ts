import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import Database, { type Database as SqliteDatabase } from 'better-sqlite3';

import { config } from '../config.js';
import { createLayerLogger } from '../logger.js';

const storageLogger = createLayerLogger('storage');
const sqliteHeader = 'SQLite format 3\u0000';
const defaultMigrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export interface MigrationOptions {
  migrationsDir?: string;
}

export interface DatabaseHandle {
  database: SqliteDatabase;
  databasePath: string;
  withTransaction<T>(fn: (database: SqliteDatabase) => T): T;
  runMigrations(options?: MigrationOptions): string[];
  close(): void;
}

const ensureParentDir = (filePath: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
};

const normalizeDatabaseFile = (databasePath: string): void => {
  if (!fs.existsSync(databasePath)) {
    return;
  }

  const fileHandle = fs.openSync(databasePath, 'r');

  try {
    const buffer = Buffer.alloc(sqliteHeader.length);
    const bytesRead = fs.readSync(fileHandle, buffer, 0, buffer.length, 0);
    const header = buffer.subarray(0, bytesRead).toString('utf8');

    if (bytesRead === 0 || header === sqliteHeader) {
      return;
    }
  } finally {
    fs.closeSync(fileHandle);
  }

  const backupPath = `${databasePath}.bak-${Date.now()}`;
  fs.renameSync(databasePath, backupPath);
  storageLogger.warn(
    { databasePath, backupPath },
    'Existing database file was not valid SQLite and has been backed up',
  );
};

const ensureMigrationTable = (database: SqliteDatabase): void => {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
};

const resolveMigrationsDir = (customDir?: string): string => {
  if (customDir) {
    return path.resolve(customDir);
  }

  return defaultMigrationsDir;
};

const runMigrationsInternal = (
  database: SqliteDatabase,
  migrationsDir: string,
): string[] => {
  ensureMigrationTable(database);

  if (!fs.existsSync(migrationsDir)) {
    storageLogger.warn({ migrationsDir }, 'Migrations directory does not exist');
    return [];
  }

  const applied = new Set<string>(
    (
      database
        .prepare('SELECT name FROM schema_migrations ORDER BY name')
        .all() as Array<{ name: string }>
    ).map((row) => row.name),
  );

  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right));

  const executed: string[] = [];

  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) {
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, fileName), 'utf8').trim();

    const applyMigration = database.transaction(() => {
      if (sql.length > 0) {
        database.exec(sql);
      }

      database
        .prepare('INSERT INTO schema_migrations (name) VALUES (?)')
        .run(fileName);
    });

    applyMigration();
    executed.push(fileName);
  }

  return executed;
};

const createDatabaseHandle = (databasePath: string): DatabaseHandle => {
  ensureParentDir(databasePath);
  normalizeDatabaseFile(databasePath);

  const database = new Database(databasePath);

  database.pragma('journal_mode = WAL');
  database.pragma('foreign_keys = ON');
  database.pragma('busy_timeout = 5000');
  database.pragma('synchronous = NORMAL');

  return {
    database,
    databasePath,
    withTransaction<T>(fn: (sqlite: SqliteDatabase) => T): T {
      return database.transaction(() => fn(database))();
    },
    runMigrations(options?: MigrationOptions): string[] {
      const migrationsDir = resolveMigrationsDir(options?.migrationsDir);
      const executed = runMigrationsInternal(database, migrationsDir);

      storageLogger.info(
        { databasePath, migrationsDir, executedCount: executed.length, executed },
        'SQLite migrations checked',
      );

      return executed;
    },
    close(): void {
      if (database.open) {
        database.close();
      }
    },
  };
};

let handle: DatabaseHandle | null = null;

export const getDatabase = (): DatabaseHandle => {
  if (!handle) {
    handle = createDatabaseHandle(path.resolve(config.databasePath));
  }

  return handle;
};

export const closeDatabase = (): void => {
  if (!handle) {
    return;
  }

  handle.close();
  handle = null;
};
