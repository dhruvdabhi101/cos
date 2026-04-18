import { tool } from "ai";
import { z } from "zod";
import { embedTexts } from "@/lib/embed";
import type { AgentContext } from "../runtime";
import { truncate } from "../formatters";

type Match = {
  note_id: string;
  chunk_index: number;
  chunk_text: string;
  score: number;
};

const inputSchema = z.object({
  query: z
    .string()
    .min(1)
    .describe(
      "Natural-language query. Paraphrase the user's question for better recall; include synonyms if useful."
    ),
  top_k: z
    .number()
    .int()
    .min(1)
    .max(25)
    .default(12)
    .describe("How many chunks to return. Default 12. Raise for broad questions."),
  min_score: z
    .number()
    .min(0)
    .max(1)
    .default(0.1)
    .describe(
      "Minimum cosine similarity. Lower = more permissive. 0.1 is a good default."
    ),
});

export function semanticSearchTool(ctx: AgentContext) {
  return tool({
    description:
      "Vector search over the user's notes. Best for topical/conceptual recall ('what have I written about X?'). Returns note chunks with similarity scores. Use multiple queries if one phrasing returns little.",
    inputSchema,
    execute: async (args) => {
      const { query, top_k, min_score } = args;

      const [queryEmbedding] = await embedTexts([query]);

      const { data, error } = await ctx.supabase.rpc("match_note_chunks", {
        query_embedding: queryEmbedding,
        match_count: top_k,
        min_score,
      });
      if (error) {
        return { ok: false as const, error: error.message, results: [] };
      }

      const hits = (data ?? []) as Match[];
      if (hits.length === 0) {
        return {
          ok: true as const,
          count: 0,
          results: [],
          note:
            "No matches above threshold. Try a different phrasing, lower min_score, or switch to structured filters.",
        };
      }

      const noteIds = [...new Set(hits.map((h) => h.note_id))];
      const { data: metas } = await ctx.supabase
        .from("notes")
        .select("id, title, type")
        .in("id", noteIds);
      const metaById = new Map(
        (metas ?? []).map((m) => [
          m.id as string,
          m as { id: string; title: string | null; type: string },
        ])
      );

      const results = hits.map((h) => {
        const meta = metaById.get(h.note_id);
        const ref = ctx.sources.add({
          note_id: h.note_id,
          title: meta?.title ?? null,
          type: meta?.type ?? null,
          score: Number(h.score.toFixed(3)),
          reason: "semantic",
        });
        return {
          ref,
          note_id: h.note_id,
          title: meta?.title ?? null,
          type: meta?.type ?? null,
          similarity: Number(h.score.toFixed(3)),
          chunk: truncate(h.chunk_text, 500),
        };
      });

      return { ok: true as const, count: results.length, results };
    },
  });
}
