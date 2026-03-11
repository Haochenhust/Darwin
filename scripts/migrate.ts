import { getDatabase } from '../src/storage/db.js';

const storage = getDatabase();
const executed = storage.runMigrations();

console.log(
  JSON.stringify(
    {
      databasePath: storage.databasePath,
      executedCount: executed.length,
      executed,
    },
    null,
    2,
  ),
);
