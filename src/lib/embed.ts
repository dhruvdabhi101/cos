import { openai, MODELS } from "./openai";
import { createClient } from "./supabase/server";

/**
 * Chunk markdown by paragraph with a target size.
 * For notes, paragraph-level chunks preserve meaning better than naive splits.
 *
 * Target: ~500 tokens (~2000 chars) per chunk, with overlap at boundaries
 * so concepts spanning paragraphs don't get cut.
 */
const TARGET_CHARS = 1800;
const MIN_CHUNK_CHARS = 80;

export function chunkMarkdown(md: string, noteTitle: string | null = null): string[] {
  const clean = md.trim();
  if (!clean) return [];

  // If short, one chunk (prepend title for context)
  if (clean.length <= TARGET_CHARS) {
    return [noteTitle ? `# ${noteTitle}\n\n${clean}` : clean];
  }

  // Split on double newlines (paragraphs) and markdown headings
  const paragraphs = clean
    .split(/\n\s*\n|(?=^#{1,6}\s)/m)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const p of paragraphs) {
    // If a single paragraph exceeds target, split by sentence
    if (p.length > TARGET_CHARS) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      const sentences = p.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        if ((current + " " + s).length > TARGET_CHARS && current) {
          chunks.push(current);
          current = s;
        } else {
          current = current ? current + " " + s : s;
        }
      }
      continue;
    }

    if ((current + "\n\n" + p).length > TARGET_CHARS && current) {
      chunks.push(current);
      current = p;
    } else {
      current = current ? current + "\n\n" + p : p;
    }
  }
  if (current) chunks.push(current);

  // Prepend title to every chunk so embedding captures context
  const titled = noteTitle ? chunks.map((c) => `# ${noteTitle}\n\n${c}`) : chunks;

  // Filter out chunks too small to be meaningful
  return titled.filter((c) => c.length >= MIN_CHUNK_CHARS);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await openai.embeddings.create({
    model: MODELS.embed,
    input: texts,
  });
  return response.data.map((d) => d.embedding);
}

/**
 * Embed one note: chunk it, embed chunks, replace existing rows.
 * Replace-on-update is simpler + safer than diffing chunks.
 */
export async function embedNote(noteId: string): Promise<{ chunkCount: number }> {
  const supabase = await createClient();

  const { data: note, error } = await supabase
    .from("notes")
    .select("id, user_id, title, content_md")
    .eq("id", noteId)
    .single();

  if (error || !note) throw new Error(`Note ${noteId} not found: ${error?.message}`);

  const chunks = chunkMarkdown(note.content_md, note.title);
  if (chunks.length === 0) {
    // Empty note — delete any stale chunks
    await supabase.from("note_chunks").delete().eq("note_id", noteId);
    return { chunkCount: 0 };
  }

  const embeddings = await embedTexts(chunks);

  const rows = chunks.map((chunk_text, i) => ({
    note_id: noteId,
    user_id: note.user_id,
    chunk_index: i,
    chunk_text,
    embedding: embeddings[i],
  }));

  // Delete existing, insert new — atomic-enough for our purposes
  await supabase.from("note_chunks").delete().eq("note_id", noteId);
  const { error: insertErr } = await supabase.from("note_chunks").insert(rows);
  if (insertErr) throw new Error(`Insert chunks failed: ${insertErr.message}`);

  return { chunkCount: rows.length };
}
