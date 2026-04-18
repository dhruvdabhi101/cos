"use client";

import { useCallback } from "react";
import { db, uuid } from "@/lib/db/dexie";
import { syncNow } from "@/lib/db/sync";
import type { ClassificationResult, LocalNote } from "@/lib/types";

/**
 * Capture flow:
 *   1. Write to Dexie immediately as 'fleeting' (optimistic, <5ms)
 *   2. UI shows it right away
 *   3. Fire classify API in parallel — when it returns, update the row
 *   4. Trigger sync in the background
 *
 * The user never waits for the network.
 */
export function useCapture(userId: string) {
  const capture = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return null;

      const now = new Date().toISOString();
      const id = uuid();

      const optimistic: LocalNote = {
        id,
        user_id: userId,
        type: "fleeting",
        title: trimmed.slice(0, 80),
        content_md: trimmed,
        content_json: null,
        remind_at: null,
        reminder_status: null,
        version: 1,
        created_at: now,
        updated_at: now,
        dirty: 1,
        deleted: 0,
      };

      await db.notes.put(optimistic);

      // Classify in the background — don't await before returning
      void (async () => {
        try {
          const res = await fetch("/api/classify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: trimmed }),
          });
          if (!res.ok) throw new Error(`classify ${res.status}`);
          const result: ClassificationResult = await res.json();

          const existing = await db.notes.get(id);
          if (!existing) return; // deleted before classification finished

          const patched: LocalNote = {
            ...existing,
            type: result.type,
            title: result.title || existing.title,
            remind_at: result.remind_at,
            reminder_status: result.type === "reminder" ? "pending" : null,
            updated_at: new Date().toISOString(),
            version: existing.version + 1,
            dirty: 1,
          };
          await db.notes.put(patched);
        } catch (err) {
          console.error("[capture] classify failed:", err);
          // Note still exists as 'fleeting' — no harm done
        } finally {
          // Trigger sync, then embed once the row exists on the server
          try {
            await syncNow(userId);
            // Fire-and-forget embed — don't block UI
            fetch("/api/embed", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ note_id: id }),
            }).catch((e) => console.error("[capture] embed failed:", e));
          } catch (e) {
            console.error("[capture] sync failed:", e);
          }
        }
      })();

      return id;
    },
    [userId]
  );

  return { capture };
}
