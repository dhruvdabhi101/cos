import Dexie, { type Table } from "dexie";
import type { LocalNote } from "../types";

class CoSDatabase extends Dexie {
  notes!: Table<LocalNote, string>;

  constructor() {
    super("chief-of-staff");
    this.version(1).stores({
      // Indexed fields. `id` is PK; others are filter/sort indexes.
      notes: "id, user_id, type, updated_at, remind_at, dirty, deleted, [user_id+deleted]",
    });
  }
}

export const db = new CoSDatabase();

// UUIDv4 generator — works offline, no server round-trip needed for IDs.
export function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
