import { type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { buildChiefAgent, SourceTracker, type AgentContext } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    )
    .min(1)
    .max(40),
  clientDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  clientTz: z.string().optional(),
});

const MAX_STEPS = 8;

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }

  const now = new Date();
  const tz = body.clientTz && body.clientTz.length > 0 ? body.clientTz : "UTC";
  const localDate = body.clientDate ?? now.toISOString().slice(0, 10);

  const ctx: AgentContext = {
    supabase,
    userId: user.id,
    clock: {
      nowIso: now.toISOString(),
      localDate,
      tz,
    },
    sources: new SourceTracker(),
  };

  const agent = buildChiefAgent(ctx);

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      function send(event: string, data: unknown) {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      }

      try {
        const output = await agent.stream(
          body.messages.map((m) => ({ role: m.role, content: m.content })),
          { maxSteps: MAX_STEPS }
        );

        for await (const chunk of output.fullStream) {
          switch (chunk.type) {
            case "text-delta": {
              const delta = chunk.payload.text ?? "";
              if (delta) send("token", delta);
              break;
            }
            case "tool-call": {
              send("tool_calls", [{ name: chunk.payload.toolName }]);
              break;
            }
            case "tool-result": {
              // After each tool run, flush the accumulated sources to the UI so
              // citation pills can start populating before the final token.
              send("sources", ctx.sources.snapshot());
              break;
            }
            case "tool-error": {
              send("error", `tool ${chunk.payload.toolName}: ${String(chunk.payload.error)}`);
              break;
            }
            case "error": {
              send("error", String(chunk.payload.error ?? "stream error"));
              break;
            }
            case "abort": {
              send("error", "aborted");
              break;
            }
            case "finish": {
              // Handled below, after the loop, so final sources include the very
              // last tool result.
              break;
            }
            default:
              break;
          }
        }

        send("sources", ctx.sources.snapshot());
        send("done", {});
      } catch (err) {
        console.error("[chat] stream error:", err);
        send("error", String(err));
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
