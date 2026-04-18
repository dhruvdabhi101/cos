import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { classifyNote } from "@/lib/classify";

const Body = z.object({ text: z.string().min(1).max(10_000) });

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

  try {
    const result = await classifyNote(body.text);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[classify] failed:", err);
    // Graceful fallback: treat as fleeting so the capture never fails
    return NextResponse.json({
      type: "fleeting",
      title: body.text.slice(0, 80),
      remind_at: null,
      confidence: 0.3,
      reasoning: "classification error — defaulted to fleeting",
    });
  }
}
