import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../runtime";
import { truncate } from "../formatters";

const inputSchema = z.object({
  limit: z
    .number()
    .int()
    .min(1)
    .max(30)
    .default(10)
    .describe("How many recent notes to return."),
  types: z
    .array(z.enum(["note", "reminder", "fleeting"]))
    .optional()
    .describe("Optionally filter by note type."),
});

export function listRecentTool(ctx: AgentContext) {
  return tool({
    description:
      "Quick snapshot of the user's most recently created notes. Use for 'what have I been thinking about lately?' or as a warm-up before a more targeted search.",
    inputSchema,
    execute: async ({ limit, types }) => {
      let q = ctx.supabase
        .from("notes")
        .select(
          "id, title, type, content_md, remind_at, reminder_status, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      if (types && types.length > 0) q = q.in("type", types);

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
          created_at: n.created_at,
          remind_at: n.remind_at,
          reminder_status: n.reminder_status,
          preview: truncate(n.content_md, 400),
        };
      });

      return { ok: true as const, count: results.length, results };
    },
  });
}
