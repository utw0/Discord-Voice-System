import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, stopAllAccounts } from "@/lib/store";

export async function POST() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return NextResponse.json({ ok: false, message: "Oturum bulunamadi" }, { status: 401 });
  }

  const session = await getSession(sessionToken);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  const result = await stopAllAccounts(sessionToken);

  if (!result) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  return NextResponse.json(result);
}
