import type { AgentContext } from "../runtime";
import { semanticSearchTool } from "./semantic-search";
import { structuredQueryTool } from "./structured-query";
import { getNoteTool } from "./get-note";
import { listRecentTool } from "./list-recent";
import { rerankTool } from "./rerank";

/**
 * Build the full tool set, bound to a request-scoped context.
 * Key names are what the model sees; keep them short and purposeful.
 */
export function buildTools(ctx: AgentContext) {
  return {
    semantic_search: semanticSearchTool(ctx),
    structured_query: structuredQueryTool(ctx),
    get_note: getNoteTool(ctx),
    list_recent: listRecentTool(ctx),
    rerank: rerankTool(ctx),
  };
}

export type ChiefTools = ReturnType<typeof buildTools>;
