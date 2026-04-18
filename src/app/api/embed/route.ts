import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { embedNote } from "@/lib/embed";

const Body = z.object({ note_id: z.string().uuid() });

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  // Verify note belongs to this user (RLS enforces it, but fail fast with a clear error)
  const { data: note } = await supabase
    .from("notes")
    .select("id")
    .eq("id", body.note_id)
    .eq("user_id", user.id)
    .single();

  if (!note) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const { chunkCount } = await embedNote(body.note_id);
    return NextResponse.json({ ok: true, chunkCount });
  } catch (err) {
    console.error("[embed] failed:", err);
    return NextResponse.json({ error: "embed failed" }, { status: 500 });
  }
}
