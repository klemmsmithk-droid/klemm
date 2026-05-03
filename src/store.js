import { DatabaseSync } from "node:sqlite";

export function createStateStore({ filename }) {
  const database = new DatabaseSync(filename);
  let isClosed = false;

  database.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

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
      const row = selectState.get(id);

      return row ? JSON.parse(row.json) : null;
    },
    saveState(state, id = "default") {
      saveState.run(id, JSON.stringify(state), new Date().toISOString());
    },
    close() {
      if (isClosed) return;
      database.close();
      isClosed = true;
    },
  };
}
