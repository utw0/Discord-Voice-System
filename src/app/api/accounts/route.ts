import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { addAccounts } from "@/lib/store";
import { getSession } from "@/lib/store";

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return NextResponse.json({ ok: false, message: "Oturum bulunamadi" }, { status: 401 });
  }

  const session = await getSession(sessionToken);

  if (!session) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  return NextResponse.json({ ok: true, accounts: session.accounts, activities: session.activities });
}

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

  const result = await addAccounts(
    sessionToken,
    typeof body?.tokenLabel === "string" ? body.tokenLabel : "",
    typeof body?.username === "string" ? body.username : "",
    typeof body?.quantity === "number" ? body.quantity : 1,
    typeof body?.tokenValue === "string" ? body.tokenValue : undefined
  );

  if (!result) {
    return NextResponse.json({ ok: false, message: "Oturum geçersiz" }, { status: 401 });
  }

  return NextResponse.json(result);
}

