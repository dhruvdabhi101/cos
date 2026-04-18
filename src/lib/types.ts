export type NoteType = "note" | "reminder" | "fleeting";
export type ReminderStatus = "pending" | "fired" | "snoozed" | "done" | null;

export interface Note {
  id: string;                // uuid, generated client-side so offline creates have stable IDs
  user_id: string;
  type: NoteType;
  title: string | null;
  content_md: string;
  content_json: unknown | null;
  remind_at: string | null;  // ISO
  reminder_status: ReminderStatus;
  version: number;
  created_at: string;
  updated_at: string;
}

// Dexie-local fields that don't live in Postgres
export interface LocalNote extends Note {
  dirty: 0 | 1;              // needs push to server (0/1 because Dexie indexes booleans poorly)
  deleted: 0 | 1;             // tombstone for offline deletes
}

export interface ClassificationResult {
  type: NoteType;
  title: string;
  remind_at: string | null;
  confidence: number;
  reasoning?: string;
}
