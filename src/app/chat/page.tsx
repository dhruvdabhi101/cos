import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { ChatShell } from "./ChatShell";

export default async function ChatPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <ChatShell userId={user.id} />;
}
