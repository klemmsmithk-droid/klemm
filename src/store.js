import { DatabaseSync } from "node:sqlite";

export function createStateStore({ filename }) {
  const database = new DatabaseSync(filename);
  let isClosed = false;

  withSqliteRetry(() => database.exec("PRAGMA busy_timeout = 250"));
  try {
    withSqliteRetry(() => database.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL"), { attempts: 5, delayMs: 75 });
  } catch (error) {
    if (!isSqliteLocked(error)) throw error;
  }

  withSqliteRetry(() => database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `));

  const selectState = database.prepare("SELECT json FROM app_state WHERE id = ?");
  const saveState = database.prepare(`
    INSERT INTO app_state (id, json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      json = excluded.json,
      updated_at = excluded.updated_at
  `);

  return {
    getState(id = "default") {
      const row = withSqliteRetry(() => selectState.get(id));

      return row ? JSON.parse(row.json) : null;
    },
    saveState(state, id = "default") {
      withSqliteRetry(() => saveState.run(id, JSON.stringify(state), new Date().toISOString()));
    },
    close() {
      if (isClosed) return;
      database.close();
      isClosed = true;
    },
  };
}

function withSqliteRetry(operation, { attempts = 8, delayMs = 25 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return operation();
    } catch (error) {
      if (!isSqliteLocked(error) || attempt === attempts - 1) throw error;
      lastError = error;
      sleepSync(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}

function isSqliteLocked(error) {
  return error?.errcode === 5 || /database is locked/i.test(String(error?.message ?? ""));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
