import { type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { openai, MODELS } from "@/lib/openai";
import { embedTexts } from "@/lib/embed";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string(),
  })).min(1).max(40),
});

const TOP_K = 12;
const MIN_SCORE = 0.25;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }

  const latestUser = [...body.messages].reverse().find((m) => m.role === "user");
  if (!latestUser) return new Response(JSON.stringify({ error: "no query" }), { status: 400 });

  // 1. Embed the user's latest question
  const [queryEmbedding] = await embedTexts([latestUser.content]);

  // 2. pgvector top-K via RPC (RLS enforces user isolation)
  const { data: matches, error: matchErr } = await supabase.rpc("match_note_chunks", {
    query_embedding: queryEmbedding,
    match_count: TOP_K,
    min_score: MIN_SCORE,
  });

  if (matchErr) {
    console.error("[chat] match error:", matchErr);
    return new Response(JSON.stringify({ error: "search failed" }), { status: 500 });
  }

  type Match = { note_id: string; chunk_index: number; chunk_text: string; score: number };
  const hits = (matches ?? []) as Match[];

  // 3. Hydrate note metadata (titles, types) for citations
  const noteIds = [...new Set(hits.map((h) => h.note_id))];
  const { data: notesMeta } = await supabase
    .from("notes")
    .select("id, title, type, created_at")
    .in("id", noteIds.length ? noteIds : ["00000000-0000-0000-0000-000000000000"]);

  const metaById = new Map((notesMeta ?? []).map((n) => [n.id, n]));

  // 4. Build context block — numbered so the model can cite with [1], [2] etc.
  const contextBlocks = hits.map((h, i) => {
    const meta = metaById.get(h.note_id);
    return `[${i + 1}] (${meta?.type ?? "note"}${meta?.title ? ` — "${meta.title}"` : ""})\n${h.chunk_text}`;
  }).join("\n\n---\n\n");

  const sources = hits.map((h, i) => ({
    index: i + 1,
    note_id: h.note_id,
    title: metaById.get(h.note_id)?.title ?? null,
    type: metaById.get(h.note_id)?.type ?? null,
    score: Number(h.score.toFixed(3)),
  }));

  const systemPrompt = `You are the user's personal Chief of Staff. You have access to their private notes, reminders, and fleeting thoughts, retrieved via vector search.

Your job:
- Answer using the retrieved notes below. Cite sources inline using [N] where N is the bracketed number.
- If the notes don't contain the answer, say so honestly rather than inventing facts.
- Be direct and concise — the user prefers substance over ceremony.
- When useful, surface connections the user may not have noticed across different notes.
- If you cite nothing, say "I don't have notes on that" rather than answering from general knowledge.

Retrieved notes:
${contextBlocks || "(no relevant notes found)"}

Today is ${new Date().toISOString()}.`;

  // 5. Stream GPT-5
  const stream = await openai.chat.completions.create({
    model: MODELS.chat,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...body.messages,
    ],
  });

  // 6. Custom SSE stream: prepend sources as a metadata event, then stream deltas
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      // First event: sources payload
      controller.enqueue(
        encoder.encode(`event: sources\ndata: ${JSON.stringify(sources)}\n\n`)
      );

      try {
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta?.content ?? "";
          if (delta) {
            controller.enqueue(
              encoder.encode(`event: token\ndata: ${JSON.stringify(delta)}\n\n`)
            );
          }
        }
        controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
      } catch (err) {
        console.error("[chat] stream error:", err);
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify(String(err))}\n\n`)
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
