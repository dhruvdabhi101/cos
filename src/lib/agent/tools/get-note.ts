import { tool } from "ai";
import { z } from "zod";
import type { AgentContext } from "../runtime";

const inputSchema = z.object({
  id: z.string().uuid().describe("UUID of the note."),
});

export function getNoteTool(ctx: AgentContext) {
  return tool({
    description:
      "Fetch the FULL (un-truncated) content of a single note by id. Use when a preview from another tool cuts off and you need the rest.",
    inputSchema,
    execute: async ({ id }) => {
      const { data, error } = await ctx.supabase
        .from("notes")
        .select(
          "id, title, type, content_md, remind_at, reminder_status, created_at, updated_at"
        )
        .eq("id", id)
        .maybeSingle();

      if (error) return { ok: false as const, error: error.message };
      if (!data) return { ok: false as const, error: "not found" };

      const n = data as {
        id: string;
        title: string | null;
        type: string;
        content_md: string;
        remind_at: string | null;
        reminder_status: string | null;
        created_at: string;
        updated_at: string;
      };

      const ref = ctx.sources.add({
        note_id: n.id,
        title: n.title,
        type: n.type,
        score: 1,
        reason: "fetched",
      });

      return {
        ok: true as const,
        result: {
          ref,
          id: n.id,
          title: n.title,
          type: n.type,
          remind_at: n.remind_at,
          reminder_status: n.reminder_status,
          created_at: n.created_at,
          updated_at: n.updated_at,
          content: n.content_md,
        },
      };
    },
  });
}
