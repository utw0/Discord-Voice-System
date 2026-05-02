import { NextResponse } from "next/server";
import { assignPackage } from "@/lib/store";
import { requireAdminSession } from "@/lib/admin-guard";

export async function POST(request: Request) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.discordId !== "string" || typeof body.userName !== "string" || typeof body.tier !== "string") {
    return NextResponse.json({ ok: false, message: "Geçersiz paket verisi" }, { status: 400 });
  }

  const assignment = await assignPackage({
    discordId: body.discordId,
    userName: body.userName,
    tier: body.tier === "classic" || body.tier === "premium" ? body.tier : "free",
    customLimit: typeof body.customLimit === "number" ? body.customLimit : undefined,
    role: body.role === "admin" ? "admin" : "user"
  });

  if (!assignment) {
    return NextResponse.json({ ok: false, message: "Paket atanamadı" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, assignment });
}
