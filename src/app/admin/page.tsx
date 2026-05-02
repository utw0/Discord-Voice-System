import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VoiceControlDashboard } from "@/components/voice-control-dashboard";
import { getSession } from "@/lib/store";

export default async function AdminPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

  if (!token) {
    redirect("/");
  }

  const session = await getSession(token);

  if (!session || !session.isAdmin) {
    redirect("/");
  }

  return <VoiceControlDashboard adminMode />;
}
