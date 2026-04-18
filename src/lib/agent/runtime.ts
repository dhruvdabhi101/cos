import type { createClient } from "@/lib/supabase/server";
import { SourceTracker } from "./sources";

export type SupabaseServer = Awaited<ReturnType<typeof createClient>>;

/**
 * Per-request context given to every tool. Tools should *only* read from this
 * — never touch module-level state — so the agent stays stateless across
 * concurrent users.
 */
export interface AgentContext {
  supabase: SupabaseServer;
  userId: string;
  clock: {
    nowIso: string;
    /** The user's local date (YYYY-MM-DD), derived from clientDate when available. */
    localDate: string;
    /** IANA timezone, e.g. "America/Los_Angeles". Defaults to "UTC". */
    tz: string;
  };
  sources: SourceTracker;
}
