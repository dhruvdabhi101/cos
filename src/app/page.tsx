import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { HomeShell } from "./HomeShell";

export default async function HomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return <HomeShell userId={user.id} email={user.email ?? ""} />;
}
