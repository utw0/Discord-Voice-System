import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession, removeAccount, updateAccountMeta } from "@/lib/store";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
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

  const params = await context.params;
  const result = await updateAccountMeta(sessionToken, params.id, {
    tokenLabel: typeof body?.tokenLabel === "string" ? body.tokenLabel : undefined,
    username: typeof body?.username === "string" ? body.username : undefined
  });

  if (!result) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return NextResponse.json({ ok: false, message: "Oturum bulunamadi" }, { status: 401 });
  }

  const session = await getSession(sessionToken);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  const params = await context.params;
  const result = await removeAccount(sessionToken, params.id);

  if (!result) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  if (!result.ok) {
    return NextResponse.json(result, { status: 404 });
  }

  return NextResponse.json(result);
}
