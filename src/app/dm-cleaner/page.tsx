import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/store";
import { DmCleanerWorkbench } from "@/components/dm-cleaner-workbench";

export default async function DmCleanerPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

  if (!token) {
    redirect("/");
  }

  const session = await getSession(token);

  if (!session) {
    redirect("/");
  }

  return (
    <main className="dm-shell">
      <div className="dm-orb dm-orb-left" />
      <div className="dm-orb dm-orb-right" />

      <section className="panel dm-page">
        <header className="dm-topbar">
          <div>
            <span className="eyebrow">Luhux DM Tools</span>
            <h1>DM Mesaj Temizleyici</h1>
            <p>
              Bu ekran once mesaji tararsin, sonra sadece onay verdigin silme adimi
              calisir.
            </p>
          </div>
          <div className="dm-topbar-actions">
            <span className="status-chip live">Discord bagli</span>
            <span className="status-chip">{session.loginName}</span>
            <Link href="/" className="btn">
              Panele Don
            </Link>
          </div>
        </header>

        <DmCleanerWorkbench loginName={session.loginName} />
      </section>
    </main>
  );
}
