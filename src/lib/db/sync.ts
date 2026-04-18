"use client";

import { db } from "./dexie";
import { createClient } from "../supabase/client";
import type { LocalNote, Note } from "../types";

/**
 * Sync strategy:
 *  - Push: any local note with dirty=1 (or deleted=1) gets upserted/deleted server-side.
 *  - Pull: fetch server rows where updated_at > lastPulledAt, merge into Dexie.
 *  - Conflicts: server version wins unless local version > server version
 *    (i.e. the local change is newer and dirty).
 *
 * This is "good enough" for 2-5 users who mostly edit their own notes.
 * If you hit real concurrent-edit conflicts, graduate to Yjs later.
 */

const LAST_PULL_KEY = "cos:last-pull-at";

export async function syncNow(userId: string): Promise<{ pushed: number; pulled: number }> {
  const supabase = createClient();
  const pushed = await pushDirty(supabase, userId);
  const pulled = await pullChanges(supabase, userId);
  return { pushed, pulled };
}

async function pushDirty(supabase: ReturnType<typeof createClient>, userId: string) {
  const dirty = await db.notes
    .where("[user_id+deleted]")
    .equals([userId, 0])
    .and((n) => n.dirty === 1)
    .toArray();

  const tombstones = await db.notes
    .where("[user_id+deleted]")
    .equals([userId, 1])
    .toArray();

  let count = 0;

  if (dirty.length) {
    const payload: Note[] = dirty.map(({ dirty: _d, deleted: _del, ...n }) => n);
    const { error } = await supabase.from("notes").upsert(payload, { onConflict: "id" });
    if (error) {
      console.error("[sync] push error:", error);
    } else {
      await db.notes.bulkUpdate(dirty.map((n) => ({ key: n.id, changes: { dirty: 0 } })));
      count += dirty.length;
    }
  }

  if (tombstones.length) {
    const ids = tombstones.map((n) => n.id);
    const { error } = await supabase.from("notes").delete().in("id", ids);
    if (error) {
      console.error("[sync] delete error:", error);
    } else {
      await db.notes.bulkDelete(ids);
      count += tombstones.length;
    }
  }

  return count;
}

async function pullChanges(supabase: ReturnType<typeof createClient>, userId: string) {
  const lastPull = localStorage.getItem(LAST_PULL_KEY) ?? "1970-01-01T00:00:00Z";
  const pullStartedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .gt("updated_at", lastPull)
    .order("updated_at", { ascending: true });

  if (error) {
    console.error("[sync] pull error:", error);
    return 0;
  }
  if (!data?.length) {
    localStorage.setItem(LAST_PULL_KEY, pullStartedAt);
    return 0;
  }

  const merged: LocalNote[] = [];
  for (const remote of data as Note[]) {
    const local = await db.notes.get(remote.id);
    // Local wins if it's dirty AND has a higher version
    if (local?.dirty === 1 && local.version > remote.version) continue;
    merged.push({ ...remote, dirty: 0, deleted: 0 });
  }
  if (merged.length) await db.notes.bulkPut(merged);

  localStorage.setItem(LAST_PULL_KEY, pullStartedAt);
  return merged.length;
}

// Convenience: call on app mount + on window online event
export function registerSyncListeners(userId: string) {
  const trigger = () => void syncNow(userId).catch(console.error);

  window.addEventListener("online", trigger);
  const interval = setInterval(trigger, 30_000); // background sync every 30s

  trigger();

  return () => {
    window.removeEventListener("online", trigger);
    clearInterval(interval);
  };
}
