import { createClient } from "@/lib/supabase/server";
import { redirect, notFound } from "next/navigation";
import { NoteEditor } from "./NoteEditor";

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: note } = await supabase
    .from("notes")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!note) notFound();

  return <NoteEditor userId={user.id} note={note} />;
}
