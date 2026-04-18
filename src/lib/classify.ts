import * as chrono from "chrono-node";
import { z } from "zod";
import { openai, MODELS } from "./openai";
import type { ClassificationResult } from "./types";

const ClassificationSchema = z.object({
  type: z.enum(["note", "reminder", "fleeting"]),
  title: z.string().max(120),
  remind_at: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
});

/**
 * Fast path: if the text has explicit time language AND an imperative verb,
 * we can classify without hitting the LLM. Saves latency + cost on the
 * ~60% of captures that are obvious reminders.
 */
const REMINDER_VERBS = /\b(remind|remember|don't forget|dont forget|ping me|tell me|schedule|call|email|text|ask|buy|pick up|pickup|send)\b/i;

export function fastClassify(text: string, now = new Date()): ClassificationResult | null {
  const parsed = chrono.parse(text, now, { forwardDate: true });

  if (parsed.length === 0) return null;

  const hasImperative = REMINDER_VERBS.test(text);
  const firstResult = parsed[0];
  const remindAt = firstResult.date();

  // Heuristic: explicit time + imperative = reminder, high confidence
  if (hasImperative && remindAt) {
    // Strip the time phrase from the title for readability
    const cleaned = text.slice(0, firstResult.index).trim() +
                    " " +
                    text.slice(firstResult.index + firstResult.text.length).trim();
    const title = (cleaned || text).trim().slice(0, 120);

    return {
      type: "reminder",
      title,
      remind_at: remindAt.toISOString(),
      confidence: 0.92,
      reasoning: "fast-path: imperative verb + explicit time",
    };
  }

  return null;
}

/**
 * Slow path: GPT-4o with structured output. Used when the fast path returns null
 * OR when the fast path has low confidence.
 */
export async function llmClassify(text: string, now = new Date()): Promise<ClassificationResult> {
  const completion = await openai.chat.completions.create({
    model: MODELS.classify,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You classify raw captured thoughts into one of three types:

- "reminder": the user wants to be reminded to do something at a specific time. Must have a concrete action + a time. If no time, it's a note, not a reminder.
- "note": a lasting piece of information, an idea, a decision, a reference worth keeping.
- "fleeting": a half-formed thought, feeling, or observation that's probably not worth keeping long-term. Default to this when uncertain.

Return JSON with keys:
{
  "type": "reminder" | "note" | "fleeting",
  "title": string (<=80 chars, concise, no trailing punctuation),
  "remind_at": ISO-8601 string or null (null unless type="reminder"),
  "confidence": number between 0 and 1,
  "reasoning": short string (<=100 chars)
}

Current time is: ${now.toISOString()}.
For relative times ("tomorrow at 3pm"), resolve against current time.
If user says "remind me" without a time, pick a sensible default (next morning 9am local).`,
      },
      { role: "user", content: text },
    ],
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw);
  return ClassificationSchema.parse(parsed);
}

/**
 * Main entry point used by the capture API. Tries fast path, falls back to LLM.
 */
export async function classifyNote(text: string, now = new Date()): Promise<ClassificationResult> {
  const fast = fastClassify(text, now);
  if (fast && fast.confidence >= 0.85) return fast;
  return await llmClassify(text, now);
}
