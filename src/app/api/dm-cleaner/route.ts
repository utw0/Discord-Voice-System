import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAccountTokenForSession } from "@/lib/store";

const DISCORD_API_BASE = "https://discord.com/api/v9";

type ScanFilterMode = "mine" | "contains" | "date";

type ScanBody = {
  action: "scan";
  accountId: string;
  targetUserId: string;
  messageLimit: number;
  batchSize: number;
  delayMs: number;
  filterMode: ScanFilterMode;
  containsText: string;
  startDate: string;
  endDate: string;
  includePinned: boolean;
  includeAttachmentsOnly: boolean;
};

type DeleteBody = {
  action: "delete";
  accountId: string;
  channelId: string;
  messageIds: string[];
  batchSize: number;
  delayMs: number;
};

type DiscordUser = {
  id: string;
};

type DiscordChannel = {
  id: string;
  type: number;
  recipients?: Array<{ id: string }>;
};

type DiscordMessage = {
  id: string;
  content?: string;
  timestamp: string;
  pinned?: boolean;
  author?: { id?: string };
  attachments?: Array<unknown>;
};

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function toInt(value: unknown, fallback: number, min: number, max: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(value), min), max);
}

function isDiscordId(value: unknown) {
  return typeof value === "string" && /^\d{17,20}$/.test(value.trim());
}

async function discordRequest(token: string, path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  if (response.status !== 429) {
    return response;
  }

  if (attempt >= 4) {
    return response;
  }

  const payload = (await response.json().catch(() => null)) as { retry_after?: number } | null;
  const retrySeconds = typeof payload?.retry_after === "number" ? payload.retry_after : 1;
  await wait(Math.ceil(retrySeconds * 1000));

  return discordRequest(token, path, init, attempt + 1);
}

function buildReason(mode: ScanFilterMode, containsText: string) {
  if (mode === "contains") {
    return `\"${containsText || "metin"}\" filtresine uydu`;
  }

  if (mode === "date") {
    return "Tarih araligina uydu";
  }

  return "Kendi mesaji";
}

function getDeletePacing(delayMs: number, batchSize: number) {
  const safeBatchSize = Math.max(1, batchSize);
  const basePerMessageDelayMs = Math.max(220, Math.floor(delayMs / safeBatchSize));
  const batchCooldownMs = Math.max(900, delayMs);

  return {
    basePerMessageDelayMs,
    batchCooldownMs
  };
}

async function handleScan(sessionToken: string, body: ScanBody) {
  if (!isDiscordId(body.targetUserId)) {
    return NextResponse.json({ ok: false, message: "Gecerli bir Discord kullanici ID gir" }, { status: 400 });
  }

  const accountResult = await getAccountTokenForSession(sessionToken, body.accountId?.trim());

  if (!accountResult) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  if (!accountResult.ok) {
    return NextResponse.json({ ok: false, message: accountResult.message }, { status: 400 });
  }

  const token = accountResult.tokenValue;
  const targetUserId = body.targetUserId.trim();
  const inspectLimit = toInt(body.messageLimit, 300, 1, 1000);
  const safeBatchSize = toInt(body.batchSize, 25, 1, 100);
  const safeDelay = toInt(body.delayMs, 900, 300, 15000);
  const mode: ScanFilterMode = body.filterMode === "contains" || body.filterMode === "date" ? body.filterMode : "mine";
  const containsText = typeof body.containsText === "string" ? body.containsText.trim().toLowerCase() : "";
  const includePinned = Boolean(body.includePinned);
  const attachmentsOnly = Boolean(body.includeAttachmentsOnly);
  const startAt = body.startDate ? Date.parse(body.startDate) : null;
  const endAt = body.endDate ? Date.parse(body.endDate) : null;

  const meResponse = await discordRequest(token, "/users/@me");
  if (!meResponse.ok) {
    return NextResponse.json({ ok: false, message: "Hesap dogrulanamadi. Token gecersiz olabilir." }, { status: 400 });
  }

  const me = (await meResponse.json()) as DiscordUser;

  const channelResponse = await discordRequest(token, "/users/@me/channels");
  if (!channelResponse.ok) {
    return NextResponse.json({ ok: false, message: "DM listesi alinamadi." }, { status: 400 });
  }

  const channels = (await channelResponse.json().catch(() => [])) as DiscordChannel[];
  const targetChannel = channels.find((channel) => {
    if (!Array.isArray(channel.recipients)) {
      return false;
    }

    return channel.recipients.some((recipient) => recipient.id === targetUserId);
  });

  if (!targetChannel) {
    return NextResponse.json({
      ok: true,
      channelId: null,
      messageIds: [],
      found: 0,
      deletable: 0,
      estimatedSeconds: 0,
      previewItems: []
    });
  }

  let inspected = 0;
  let beforeId = "";
  const candidates: DiscordMessage[] = [];

  while (inspected < inspectLimit) {
    const remaining = inspectLimit - inspected;
    const fetchSize = Math.min(100, remaining);
    const query = beforeId ? `?limit=${fetchSize}&before=${beforeId}` : `?limit=${fetchSize}`;
    const messagesResponse = await discordRequest(token, `/channels/${targetChannel.id}/messages${query}`);

    if (!messagesResponse.ok) {
      break;
    }

    const batch = (await messagesResponse.json().catch(() => [])) as DiscordMessage[];

    if (batch.length === 0) {
      break;
    }

    inspected += batch.length;
    beforeId = batch[batch.length - 1]?.id ?? "";

    for (const message of batch) {
      if (message.author?.id !== me.id) {
        continue;
      }

      if (!includePinned && message.pinned) {
        continue;
      }

      if (attachmentsOnly && (!Array.isArray(message.attachments) || message.attachments.length === 0)) {
        continue;
      }

      const ts = Date.parse(message.timestamp);
      if (typeof startAt === "number" && Number.isFinite(startAt) && ts < startAt) {
        continue;
      }
      if (typeof endAt === "number" && Number.isFinite(endAt) && ts > endAt) {
        continue;
      }

      if (mode === "contains") {
        const content = (message.content ?? "").toLowerCase();
        if (!containsText || !content.includes(containsText)) {
          continue;
        }
      }

      candidates.push(message);
    }
  }

  const deletable = candidates.length;
  const pacing = getDeletePacing(safeDelay, safeBatchSize);
  const averageJitterMs = 130;
  const estimatedMessageMs = deletable * (pacing.basePerMessageDelayMs + averageJitterMs);
  const estimatedBatchWaitMs = Math.max(0, Math.ceil(deletable / safeBatchSize) - 1) * pacing.batchCooldownMs;
  const estimatedSeconds = Math.ceil((estimatedMessageMs + estimatedBatchWaitMs) / 1000);
  const previewItems = candidates.slice(0, 8).map((item) => ({
    id: item.id,
    createdAt: new Date(item.timestamp).toLocaleString("tr-TR"),
    reason: buildReason(mode, containsText)
  }));

  return NextResponse.json({
    ok: true,
    channelId: targetChannel.id,
    messageIds: candidates.map((item) => item.id),
    found: deletable,
    deletable,
    estimatedSeconds,
    previewItems
  });
}

async function deleteMessageWithRetry(token: string, channelId: string, messageId: string) {
  let lastReason = "";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await discordRequest(token, `/channels/${channelId}/messages/${messageId}`, { method: "DELETE" });

    if (response.status === 204 || response.status === 404) {
      return { ok: true as const };
    }

    if (response.status === 429) {
      const payload = (await response.json().catch(() => null)) as { retry_after?: number; message?: string } | null;
      const retrySeconds = typeof payload?.retry_after === "number" ? payload.retry_after : 1.2;
      lastReason = payload?.message ? `429: ${payload.message}` : "429: Hiz limiti asildi";
      await wait(Math.ceil(retrySeconds * 1000) + 350 + attempt * 200);
      continue;
    }

    if (response.status >= 500) {
      await wait(350 * (attempt + 1));
      lastReason = `${response.status}: Discord API gecici hata verdi`;
      continue;
    }

    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    const reason = payload?.message ? `${response.status}: ${payload.message}` : `${response.status}: Discord API istegi reddetti`;
    return { ok: false as const, reason };
  }

  return {
    ok: false as const,
    reason: lastReason || "Discord API yaniti zamaninda alinamadi veya hiz sinirina takildi"
  };
}

async function handleDelete(sessionToken: string, body: DeleteBody) {
  if (!isDiscordId(body.channelId)) {
    return NextResponse.json({ ok: false, message: "Gecerli bir DM kanal kimligi bulunamadi." }, { status: 400 });
  }

  const messageIds = Array.isArray(body.messageIds)
    ? body.messageIds.filter((id) => typeof id === "string" && /^\d{17,20}$/.test(id))
    : [];

  if (messageIds.length === 0) {
    return NextResponse.json({ ok: false, message: "Silinecek mesaj bulunamadi." }, { status: 400 });
  }

  const accountResult = await getAccountTokenForSession(sessionToken, body.accountId?.trim());

  if (!accountResult) {
    return NextResponse.json({ ok: false, message: "Oturum gecersiz" }, { status: 401 });
  }

  if (!accountResult.ok) {
    return NextResponse.json({ ok: false, message: accountResult.message }, { status: 400 });
  }

  const token = accountResult.tokenValue;
  const safeBatchSize = toInt(body.batchSize, 25, 1, 100);
  const safeDelay = toInt(body.delayMs, 900, 300, 15000);
  const pacing = getDeletePacing(safeDelay, safeBatchSize);

  let removed = 0;
  let failed = 0;
  let failedReason = "";
  const failedMessageIds: string[] = [];

  for (let index = 0; index < messageIds.length; index += safeBatchSize) {
    const chunk = messageIds.slice(index, index + safeBatchSize);

    for (const messageId of chunk) {
      const result = await deleteMessageWithRetry(token, body.channelId, messageId);
      if (result.ok) {
        removed += 1;
      } else {
        failed += 1;
        failedMessageIds.push(messageId);
        if (!failedReason) {
          failedReason = result.reason;
        }
      }

      const jitterMs = 60 + Math.floor(Math.random() * 141);
      await wait(pacing.basePerMessageDelayMs + jitterMs);
    }

    if (index + safeBatchSize < messageIds.length) {
      await wait(pacing.batchCooldownMs);
    }
  }

  return NextResponse.json({
    ok: true,
    removed,
    failed,
    total: messageIds.length,
    failedMessageIds,
    failedReason: failedReason || undefined
  });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("session_token")?.value;

  if (!sessionToken) {
    return NextResponse.json({ ok: false, message: "Oturum bulunamadi" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as ScanBody | DeleteBody | null;

  if (!body || typeof body !== "object" || typeof body.action !== "string") {
    return NextResponse.json({ ok: false, message: "Gecersiz istek" }, { status: 400 });
  }

  if (body.action === "scan") {
    return handleScan(sessionToken, body as ScanBody);
  }

  if (body.action === "delete") {
    return handleDelete(sessionToken, body as DeleteBody);
  }

  return NextResponse.json({ ok: false, message: "Bilinmeyen islem" }, { status: 400 });
}
