import { NextResponse } from "next/server";
import { createOAuthState } from "@/lib/store";

function getDiscordAuthConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID?.trim();
  const redirectUri = process.env.DISCORD_REDIRECT_URI?.trim();

  if (!clientId || !redirectUri) {
    return null;
  }

  if (!/^\d{17,19}$/.test(clientId)) {
    return null;
  }

  try {
    const parsed = new URL(redirectUri);
    if (!parsed.protocol.startsWith("http")) {
      return null;
    }
  } catch {
    return null;
  }

  return { clientId, redirectUri };
}

export async function GET(request: Request) {
  const config = getDiscordAuthConfig();

  if (!config) {
    return NextResponse.redirect(new URL("/?authError=config", request.url));
  }

  const state = await createOAuthState();
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: "identify",
    state,
    prompt: "consent"
  });

  const response = NextResponse.redirect(`https://discord.com/oauth2/authorize?${params.toString()}`);
  response.cookies.set("discord_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10
  });

  return response;
}
