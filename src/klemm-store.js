import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import { createInitialKlemmState } from "./klemm.js";
import { createStateStore } from "./store.js";

export const KLEMM_DATA_DIR = process.env.KLEMM_DATA_DIR || join(process.cwd(), "data");
export const DEFAULT_KLEMM_DATABASE = join(KLEMM_DATA_DIR, "klemm.sqlite");

export function createKlemmStore({ filename = DEFAULT_KLEMM_DATABASE } = {}) {
  if (!existsSync(KLEMM_DATA_DIR)) {
    mkdirSync(KLEMM_DATA_DIR, { recursive: true });
  }

  const store = createStateStore({ filename });

  return {
    getState() {
      const state = store.getState("klemm");
      if (state) return state;
      const initial = createInitialKlemmState();
      store.saveState(initial, "klemm");
      return initial;
    },
    saveState(state) {
      store.saveState(state, "klemm");
    },
    update(fn) {
      const next = fn(this.getState());
      this.saveState(next);
      return next;
    },
    close() {
      store.close();
    },
  };
}
