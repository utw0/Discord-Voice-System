import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createJoinJob } from "@/lib/store";
import { getSession } from "@/lib/store";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;
  const body = await request.json().catch(() => null);

  if (!sessionToken) {
    return NextResponse.json({ ok: false, message: "Oturum bulunamadi" }, { status: 401 });
  }

  const session = await getSession(sessionToken);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  if (!body || typeof body.serverName !== "string" || typeof body.voiceChannel !== "string") {
    return NextResponse.json({ ok: false, message: "Geçersiz istek" }, { status: 400 });
  }

  const result = await createJoinJob(
    sessionToken,
    body.serverName,
    body.voiceChannel,
    typeof body.streamModeEnabled === "boolean" ? body.streamModeEnabled : false,
    typeof body.cameraModeEnabled === "boolean" ? body.cameraModeEnabled : false
  );

  if (!result) {
    return NextResponse.json({ ok: false, message: "Oturum geçersiz" }, { status: 401 });
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
