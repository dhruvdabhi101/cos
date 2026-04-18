import OpenAI from "openai";

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export const MODELS = {
  classify: "gpt-4o",          // fast structured output
  chat: "gpt-5",               // deep reasoning for chat-with-notes
  embed: "text-embedding-3-small", // 1536 dims
} as const;
