import { tool } from "ai";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { AgentContext } from "../runtime";
import { truncate } from "../formatters";

const inputSchema = z.object({
  question: z
    .string()
    .min(1)
    .describe("The user's underlying question that results should answer."),
  candidate_refs: z
    .array(z.number().int().positive())
    .min(2)
    .max(30)
    .describe(
      "Citation refs returned by previous search/query tools. The reranker will load these notes and score each one's relevance to the question."
    ),
  top_n: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("How many ranked items to return."),
});

const outputSchema = z.object({
  ranking: z
    .array(
      z.object({
        ref: z.number().int().positive(),
        relevance: z
          .number()
          .min(0)
          .max(1)
          .describe("0 = unrelated, 1 = directly answers the question."),
        reason: z.string().describe("One sentence on why this note is (or isn't) relevant."),
      })
    )
    .describe("Ordered from most to least relevant."),
});

/**
 * LLM cross-encoder reranker. Run this AFTER semantic_search when you have a
 * lot of candidates and want to pick the highest-signal few before composing
 * the final answer. Adds latency but significantly raises accuracy.
 */
export function rerankTool(ctx: AgentContext) {
  return tool({
    description:
      "Re-score a set of candidate notes against the user's question using a fast reasoning model. Use after semantic_search when you have many candidates and need to pick the best few for the answer. Optional but strongly improves precision.",
    inputSchema,
    execute: async ({ question, candidate_refs, top_n }) => {
      const snapshot = ctx.sources.snapshot();
      const byRef = new Map(snapshot.map((s) => [s.index, s]));
      const refs = [...new Set(candidate_refs)].filter((r) => byRef.has(r));
      if (refs.length === 0) {
        return {
          ok: false as const,
          error: "None of the supplied refs have been cited yet.",
          ranking: [],
        };
      }

      const noteIds = refs.map((r) => byRef.get(r)!.note_id);
      const { data, error } = await ctx.supabase
        .from("notes")
        .select("id, title, type, content_md")
        .in("id", noteIds);
      if (error) return { ok: false as const, error: error.message, ranking: [] };

      const contentById = new Map(
        (data ?? []).map((n) => [
          n.id as string,
          n as { id: string; title: string | null; type: string; content_md: string },
        ])
      );

      const corpus = refs
        .map((r) => {
          const s = byRef.get(r)!;
          const body = contentById.get(s.note_id);
          return `[${r}] (${s.type ?? "note"}${
            s.title ? ` — "${s.title}"` : ""
          })\n${truncate(body?.content_md, 700)}`;
        })
        .join("\n\n---\n\n");

      const { object } = await generateObject({
        model: openai("gpt-4o-mini"),
        schema: outputSchema,
        system:
          "You rank notes by relevance to a user's question. Only score what the note actually contains; do not speculate. Return refs exactly as given.",
        prompt: `Question:\n${question}\n\nCandidate notes:\n\n${corpus}\n\nReturn a ranking (highest relevance first) of up to ${top_n} items.`,
      });

      const ranking = object.ranking
        .filter((r) => byRef.has(r.ref))
        .slice(0, top_n)
        .map((r) => {
          const s = byRef.get(r.ref)!;
          return {
            ref: r.ref,
            relevance: r.relevance,
            reason: r.reason,
            title: s.title,
            type: s.type,
          };
        });

      return { ok: true as const, ranking };
    },
  });
}
