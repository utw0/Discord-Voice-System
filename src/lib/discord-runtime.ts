import { createRequire } from "node:module";

type ActiveBot = {
  client: { destroy: () => void };
  connection: { destroy: () => void };
};

type SelfbotClient = {
  login: (token: string) => Promise<unknown>;
  destroy: () => void;
  guilds: { fetch: (guildId: string) => Promise<{ id: string }> };
  channels: { fetch: (channelId: string) => Promise<unknown> };
  ws: { broadcast: (payload: unknown) => Promise<unknown> | unknown };
  user?: { tag?: string; username?: string };
};

const require = createRequire(import.meta.url);

function loadDiscordLibs() {
  const discordJs = require("discord.js-selfbot-v13") as {
    Client: new (options?: Record<string, unknown>) => SelfbotClient;
  };

  return discordJs;
}

const runtimeState = globalThis as unknown as {
  activeBots?: Map<string, ActiveBot>;
  selfbotCrashHookInstalled?: boolean;
  selfbotPacketWarned?: Set<string>;
};

const activeBots = runtimeState.activeBots ?? new Map<string, ActiveBot>();
if (!runtimeState.activeBots) {
  runtimeState.activeBots = activeBots;
}

const selfbotPacketWarned = runtimeState.selfbotPacketWarned ?? new Set<string>();
if (!runtimeState.selfbotPacketWarned) {
  runtimeState.selfbotPacketWarned = selfbotPacketWarned;
}

function patchClientPacketHandling(client: SelfbotClient) {
  const maybeWs = client as SelfbotClient & {
    ws?: {
      __selfbotPacketGuardPatched?: boolean;
      handlePacket?: (packet?: { t?: string }, shard?: unknown) => boolean;
    };
  };

  const ws = maybeWs.ws;
  if (!ws || ws.__selfbotPacketGuardPatched || typeof ws.handlePacket !== "function") {
    return;
  }

  const originalHandlePacket = ws.handlePacket.bind(ws);

  ws.handlePacket = (packet?: { t?: string }, shard?: unknown) => {
    const packetType = packet?.t;

    if (packetType === "THREAD_LIST_SYNC" || packetType === "GUILD_MEMBER_UPDATE") {
      if (!selfbotPacketWarned.has(packetType)) {
        console.warn(`[selfbot] ${packetType} packet ignored to prevent runtime crash.`);
        selfbotPacketWarned.add(packetType);
      }
      return true;
    }

    return originalHandlePacket(packet, shard);
  };

  ws.__selfbotPacketGuardPatched = true;
}

function ensureSelfbotCrashGuard() {
  if (runtimeState.selfbotCrashHookInstalled) {
    return;
  }

  process.on("uncaughtException", (error) => {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Cannot read properties of undefined (reading 'handle')") || message.includes("THREAD_LIST_SYNC")) {
      console.warn("[selfbot] THREAD_LIST_SYNC packet ignored to prevent runtime crash.");
      return;
    }

    throw error;
  });

  runtimeState.selfbotCrashHookInstalled = true;
}

function isVoiceChannel(channel: unknown): channel is { id: string; type?: number | string } {
  if (!channel || typeof channel !== "object") {
    return false;
  }

  const maybeChannel = channel as {
    id?: string;
    type?: number | string;
    isVoiceBased?: () => boolean;
  };

  if (typeof maybeChannel.id !== "string" || maybeChannel.id.length === 0) {
    return false;
  }

  if (typeof maybeChannel.isVoiceBased === "function" && maybeChannel.isVoiceBased()) {
    return true;
  }

  const maybeType = maybeChannel.type;

  if (typeof maybeType === "number") {
    return maybeType === 2 || maybeType === 13;
  }

  if (typeof maybeType === "string") {
    return maybeType === "GUILD_VOICE" || maybeType === "GUILD_STAGE_VOICE" || maybeType === "GuildVoice" || maybeType === "GuildStageVoice";
  }

  return false;
}

export async function connectAccountToVoice(params: {
  accountId: string;
  token: string;
  guildId: string;
  channelId: string;
  enableStream?: boolean;
  enableCamera?: boolean;
}) {
  ensureSelfbotCrashGuard();

  const existing = activeBots.get(params.accountId);
  const { Client } = loadDiscordLibs();

  if (existing) {
    try {
      existing.connection.destroy();
    } catch {
    }
    try {
      existing.client.destroy();
    } catch {
    }
    activeBots.delete(params.accountId);
  }

  const client = new Client();
  patchClientPacketHandling(client);

  await client.login(params.token);

  const guild = await client.guilds.fetch(params.guildId);
  const channel = await client.channels.fetch(params.channelId);

  if (!isVoiceChannel(channel)) {
    client.destroy();
    throw new Error("Hedef kanal ses kanalı değil veya erişilemiyor.");
  }

  const modeWarnings: string[] = [];
  const { Streamer } = await import("@dank074/discord-video-stream");

  const streamer = new Streamer(client as never);
  await streamer.joinVoice(guild.id, channel.id);

  let stopStreamProcess: (() => void) | null = null;

  if (params.enableStream || params.enableCamera) {
    try {
      if (params.enableCamera) {
        streamer.signalVideo(true);
      }
      if (params.enableStream) {
        streamer.signalStream();
      }

      stopStreamProcess = () => {
        if (params.enableStream) {
          try {
            streamer.signalStopStream();
          } catch {

          }
        }
        if (params.enableCamera) {
          try {
            streamer.signalVideo(false);
          } catch {
          }
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[voice] stream init failed for ${params.accountId}: ${message}`);
      modeWarnings.push("yayin/kamera akis baslatilamadi");
    }
  }

  activeBots.set(params.accountId, {
    client,
    connection: {
      destroy: () => {
        if (stopStreamProcess) {
          try {
            stopStreamProcess();
          } catch {
          }
        }
        try {
          streamer.stopStream();
        } catch {
        }
        try {
          streamer.leaveVoice();
        } catch {
        }
      }
    }
  });

  return {
    botTag: client.user?.tag ?? client.user?.username ?? "unknown",
    modeWarnings
  };
}

export function disconnectAccount(accountId: string) {
  const existing = activeBots.get(accountId);

  if (!existing) {
    return;
  }

  try {
    existing.connection.destroy();
  } catch {
  }
  try {
    existing.client.destroy();
  } catch {
  }

  activeBots.delete(accountId);
}

export function getActiveAccountIds() {
  return Array.from(activeBots.keys());
}
