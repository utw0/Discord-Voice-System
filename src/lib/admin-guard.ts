import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/store";

type GuardSuccess = {
  ok: true;
  sessionToken: string;
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>;
};

type GuardFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireAdminSession(): Promise<GuardSuccess | GuardFailure> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "Oturum bulunamadi" }, { status: 401 })
    };
  }

  const session = await getSession(sessionToken);

  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 })
    };
  }

  if (!session.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, message: "Admin yetkisi gerekiyor" }, { status: 403 })
    };
  }

  return {
    ok: true,
    sessionToken,
    session
  };
}
