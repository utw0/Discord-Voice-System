import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, removeSession } from "@/lib/store";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

  if (!token) {
    return NextResponse.json({ ok: false, message: "Bulunamadi" }, { status: 404 });
  }

  const session = await getSession(token);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Bulunamadi" }, { status: 404 });
  }

  const { sessionToken: _sessionToken, ...safeSession } = session;
  return NextResponse.json({ ok: true, ...safeSession });
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;

  if (token) {
    await removeSession(token);
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("session_token", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
