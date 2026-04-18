import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { MODELS } from "@/lib/openai";
import type { AgentContext } from "./runtime";
import { buildInstructions } from "./instructions";
import { buildTools } from "./tools";

export { SourceTracker } from "./sources";
export type { Source } from "./sources";
export type { AgentContext } from "./runtime";

/**
 * Build a fresh Mastra Agent scoped to one request. The tools close over
 * `ctx` so they always query with the caller's Supabase session (RLS-safe).
 *
 * We keep the agent per-request rather than module-global because:
 *  - instructions bake in the user's clock/timezone
 *  - tools need the authenticated supabase client
 *  - sources are tracked per conversation turn
 */
export function buildChiefAgent(ctx: AgentContext) {
  return new Agent({
    id: "chief-of-staff",
    name: "chief-of-staff",
    instructions: buildInstructions(ctx),
    model: openai(MODELS.chat),
    tools: buildTools(ctx),
  });
}
