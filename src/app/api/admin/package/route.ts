import { NextResponse } from "next/server";
import { updatePackageConfig } from "@/lib/store";
import { requireAdminSession } from "@/lib/admin-guard";

export async function POST(request: Request) {
  const guard = await requireAdminSession();
  if (!guard.ok) {
    return guard.response;
  }

  const body = await request.json().catch(() => null);

  if (!body || typeof body.name !== "string") {
    return NextResponse.json({ ok: false, message: "Geçersiz paket verisi" }, { status: 400 });
  }

  const packageConfig = await updatePackageConfig({
    name: body.name,
    active: Boolean(body.active),
    limit: Number(body.limit) || 1,
    serverName: typeof body.serverName === "string" ? body.serverName : "luhux1337",
    voiceChannel: typeof body.voiceChannel === "string" ? body.voiceChannel : "1337..."
  });

  return NextResponse.json({ ok: true, packageConfig });
}

