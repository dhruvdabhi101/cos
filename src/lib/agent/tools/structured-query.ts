import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../runtime";
import { truncate } from "../formatters";

const NoteType = z.enum(["note", "reminder", "fleeting"]);
const ReminderStatus = z.enum(["pending", "fired", "snoozed", "done"]);

const inputSchema = z.object({
  created_after: z
    .string()
    .describe("ISO-8601 datetime. Only notes created at or after this time.")
    .optional(),
  created_before: z
    .string()
    .describe("ISO-8601 datetime. Only notes created strictly before this time.")
    .optional(),
  remind_after: z
    .string()
    .describe("ISO-8601 datetime. Only notes with remind_at >= this time.")
    .optional(),
  remind_before: z
    .string()
    .describe("ISO-8601 datetime. Only notes with remind_at < this time.")
    .optional(),
  types: z.array(NoteType).optional().describe("Filter by note type(s)."),
  reminder_status: ReminderStatus
    .optional()
    .describe("Exact reminder_status match."),
  exclude_reminder_status: z
    .array(ReminderStatus)
    .optional()
    .describe("Exclude notes whose reminder_status is in this list."),
  title_contains: z
    .string()
    .optional()
    .describe("Case-insensitive substring match against the title."),
  content_contains: z
    .string()
    .optional()
    .describe(
      "Case-insensitive substring match against the content_md (full note body)."
    ),
  order_by: z
    .enum(["created_at", "updated_at", "remind_at"])
    .default("created_at"),
  order_dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.number().int().min(1).max(50).default(20),
});

export function structuredQueryTool(ctx: AgentContext) {
  return tool({
    description:
      "SQL-style filters over the user's notes. Best for temporal / categorical questions (today, this week, 'all my reminders', 'fleeting notes from last Monday', etc.). Compose filters freely. RLS restricts rows to the current user automatically.",
    inputSchema,
    execute: async (args) => {
      let q = ctx.supabase
        .from("notes")
        .select(
          "id, title, type, content_md, remind_at, reminder_status, created_at, updated_at"
        );

      if (args.created_after) q = q.gte("created_at", args.created_after);
      if (args.created_before) q = q.lt("created_at", args.created_before);
      if (args.remind_after) {
        q = q.not("remind_at", "is", null).gte("remind_at", args.remind_after);
      }
      if (args.remind_before) {
        q = q.not("remind_at", "is", null).lt("remind_at", args.remind_before);
      }
      if (args.types && args.types.length > 0) q = q.in("type", args.types);
      if (args.reminder_status) q = q.eq("reminder_status", args.reminder_status);
      if (args.exclude_reminder_status && args.exclude_reminder_status.length > 0) {
        q = q.not(
          "reminder_status",
          "in",
          `(${args.exclude_reminder_status.join(",")})`
        );
      }
      if (args.title_contains) q = q.ilike("title", `%${args.title_contains}%`);
      if (args.content_contains)
        q = q.ilike("content_md", `%${args.content_contains}%`);

      q = q
        .order(args.order_by, { ascending: args.order_dir === "asc" })
        .limit(args.limit);

      const { data, error } = await q;
      if (error) return { ok: false as const, error: error.message, results: [] };

      const rows = (data ?? []) as {
        id: string;
        title: string | null;
        type: string;
        content_md: string;
        remind_at: string | null;
        reminder_status: string | null;
        created_at: string;
        updated_at: string;
      }[];

      const results = rows.map((n) => {
        const ref = ctx.sources.add({
          note_id: n.id,
          title: n.title,
          type: n.type,
          score: 1,
          reason: "structured",
        });
        return {
          ref,
          id: n.id,
          title: n.title,
          type: n.type,
          remind_at: n.remind_at,
          reminder_status: n.reminder_status,
          created_at: n.created_at,
          updated_at: n.updated_at,
          content: truncate(n.content_md),
        };
      });

      return { ok: true as const, count: results.length, results };
    },
  });
}
