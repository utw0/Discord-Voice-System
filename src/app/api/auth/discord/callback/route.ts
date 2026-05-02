import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { consumeOAuthState, createDiscordSession } from "@/lib/store";

function getDiscordAuthConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

export async function GET(request: Request) {
  const config = getDiscordAuthConfig();

  if (!config) {
    return NextResponse.redirect(new URL("/?authError=config", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get("discord_oauth_state")?.value;

  if (!code || !state || !storedState || state !== storedState) {
    return NextResponse.redirect(new URL("/?authError=state", request.url));
  }

  const validState = await consumeOAuthState(state);
  if (!validState) {
    return NextResponse.redirect(new URL("/?authError=expired", request.url));
  }

  const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri
    })
  });

  if (!tokenResponse.ok) {
    return NextResponse.redirect(new URL("/?authError=token", request.url));
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };

  if (!tokenData.access_token) {
    return NextResponse.redirect(new URL("/?authError=token", request.url));
  }

  const userResponse = await fetch("https://discord.com/api/users/@me", {
    headers: {
      Authorization: `Bearer ${tokenData.access_token}`
    }
  });

  if (!userResponse.ok) {
    return NextResponse.redirect(new URL("/?authError=user", request.url));
  }

  const userData = (await userResponse.json()) as {
    id: string;
    username: string;
    avatar: string | null;
  };

  const session = await createDiscordSession({
    id: userData.id,
    username: userData.username,
    avatar: userData.avatar
  });

  if (!session) {
    return NextResponse.redirect(new URL("/?authError=session", request.url));
  }

  const response = NextResponse.redirect(new URL("/?auth=ok", request.url));
  response.cookies.set("session_token", session.sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24
  });
  response.cookies.set("discord_oauth_state", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  });

  return response;
}
