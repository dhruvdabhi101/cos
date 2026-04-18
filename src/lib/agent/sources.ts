export interface Source {
  index: number;
  note_id: string;
  title: string | null;
  type: string | null;
  score: number;
  reason?: "semantic" | "structured" | "fetched";
}

export interface SourceInput {
  note_id: string;
  title: string | null;
  type: string | null;
  score: number;
  reason?: Source["reason"];
}

/**
 * Accumulates every note referenced by a tool call, de-duplicates by note_id,
 * and assigns a stable [N] citation index (1-based). The tools return this
 * `index` back to the model so it can cite accurately.
 */
export class SourceTracker {
  private readonly order: string[] = [];
  private readonly byId = new Map<string, Source>();

  add(input: SourceInput): number {
    const existing = this.byId.get(input.note_id);
    if (existing) {
      // Prefer the higher-signal score/reason when we see the same note again
      if (input.score > existing.score) {
        existing.score = input.score;
      }
      if (input.reason && !existing.reason) {
        existing.reason = input.reason;
      }
      if (input.title && !existing.title) existing.title = input.title;
      if (input.type && !existing.type) existing.type = input.type;
      return existing.index;
    }
    const index = this.order.length + 1;
    const source: Source = {
      index,
      note_id: input.note_id,
      title: input.title,
      type: input.type,
      score: input.score,
      reason: input.reason,
    };
    this.byId.set(input.note_id, source);
    this.order.push(input.note_id);
    return index;
  }

  snapshot(): Source[] {
    return this.order.map((id) => ({ ...this.byId.get(id)! }));
  }

  size(): number {
    return this.order.length;
  }
}
