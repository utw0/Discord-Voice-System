import crypto from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

type PackageTier = "free" | "classic" | "premium";
type AdminRole = "user" | "admin";

type PackageProfile = {
  tier: PackageTier;
  name: string;
  active: boolean;
  limit: number;
};

type Store = {
  packageConfig: {
    name: string;
    active: boolean;
    limit: number;
    serverName: string;
    voiceChannel: string;
  };
  sessions: Array<{
    token: string;
    userName: string;
    avatarUrl: string | null;
    discordId: string;
    packageTier: PackageTier;
    packageLimit: number;
    expiresAt: string;
  }>;
  oauthStates: Array<{
    state: string;
    expiresAt: string;
  }>;
  packageAssignments: Array<{
    discordId: string;
    userName: string;
    tier: PackageTier;
    name: string;
    limit: number;
    active: boolean;
    role: AdminRole;
    updatedAt: string;
  }>;
  accounts: Array<{
    id: string;
    ownerDiscordId: string;
    sessionToken?: string;
    tokenLabel: string;
    tokenValue: string;
    username: string;
    status: "idle" | "ready" | "live";
    createdAt: string;
  }>;
  activities: Array<{
    id: string;
    ownerDiscordId: string;
    sessionToken?: string;
    title: string;
    detail: string;
    tone: "ok" | "warn" | "live";
    createdAt: string;
  }>;
  joinJobs: Array<{
    id: string;
    ownerDiscordId: string;
    sessionToken?: string;
    serverName: string;
    voiceChannel: string;
    accountCount: number;
    status: string;
    createdAt: string;
  }>;
  userVoiceTargets: Array<{
    discordId: string;
    serverName: string;
    voiceChannel: string;
    updatedAt: string;
  }>;
};

const packageDefaults: Record<PackageTier, { name: string; limit: number }> = {
  free: { name: "Luhux Free", limit: 1 },
  classic: { name: "Luhux Classic", limit: 3 },
  premium: { name: "Luhux Premium", limit: 5 }
};

const dataDirectory = path.join(process.cwd(), "data");
const storeFile = path.join(dataDirectory, "dashboard.json");

const tokenCipherPrefix = "enc:v1:";

const runtimeState = globalThis as unknown as {
  storeWriteQueue?: Promise<void>;
  tokenEncryptionWarningShown?: boolean;
};

const defaultStore: Store = {
  packageConfig: {
    name: "Luhux Premium Pack",
    active: true,
    limit: 3,
    serverName: "",
    voiceChannel: ""
  },
  sessions: [],
  oauthStates: [],
  packageAssignments: [],
  accounts: [],
  activities: [],
  joinJobs: [],
  userVoiceTargets: []
};

function createToken() {
  return crypto.randomBytes(24).toString("hex");
}

function createId() {
  return crypto.randomUUID();
}

async function ensureStoreFile() {
  await mkdir(dataDirectory, { recursive: true });

  try {
    await readFile(storeFile, "utf8");
  } catch {
    await writeFile(storeFile, JSON.stringify(defaultStore, null, 2), "utf8");
  }
}

async function readStore(): Promise<Store> {
  await ensureStoreFile();
  const raw = await readFile(storeFile, "utf8");
  const parsed = JSON.parse(raw) as Partial<Store>;

  const sessions = parsed.sessions ?? [];
  const sessionOwnerMap = new Map(
    sessions
      .map((session) => [session.token?.trim() ?? "", session.discordId?.trim() ?? ""] as const)
      .filter(([token, discordId]) => token.length > 0 && discordId.length > 0)
  );

  return {
    ...defaultStore,
    ...parsed,
    packageConfig: parsed.packageConfig ?? defaultStore.packageConfig,
    sessions,
    oauthStates: parsed.oauthStates ?? [],
    packageAssignments: parsed.packageAssignments ?? [],
    accounts: (parsed.accounts ?? []).map((account) => {
      const normalizedSessionToken = typeof account.sessionToken === "string" ? account.sessionToken.trim() : "";
      const ownerDiscordId =
        typeof account.ownerDiscordId === "string" && account.ownerDiscordId.trim().length > 0
          ? account.ownerDiscordId.trim()
          : (sessionOwnerMap.get(normalizedSessionToken) ?? "");

      return {
        ...account,
        ownerDiscordId,
        sessionToken: normalizedSessionToken,
        tokenValue: decryptTokenValue(account.tokenValue ?? "")
      };
    }),
    activities: (parsed.activities ?? []).map((activity) => {
      const normalizedSessionToken = typeof activity.sessionToken === "string" ? activity.sessionToken.trim() : "";
      const ownerDiscordId =
        typeof activity.ownerDiscordId === "string" && activity.ownerDiscordId.trim().length > 0
          ? activity.ownerDiscordId.trim()
          : (sessionOwnerMap.get(normalizedSessionToken) ?? "");

      return {
        ...activity,
        ownerDiscordId,
        sessionToken: normalizedSessionToken
      };
    }),
    joinJobs: (parsed.joinJobs ?? []).map((job) => {
      const normalizedSessionToken = typeof job.sessionToken === "string" ? job.sessionToken.trim() : "";
      const ownerDiscordId =
        typeof job.ownerDiscordId === "string" && job.ownerDiscordId.trim().length > 0
          ? job.ownerDiscordId.trim()
          : (sessionOwnerMap.get(normalizedSessionToken) ?? "");

      return {
        ...job,
        ownerDiscordId,
        sessionToken: normalizedSessionToken
      };
    }),
    userVoiceTargets: (parsed.userVoiceTargets ?? []).filter(
      (item) => typeof item.discordId === "string" && item.discordId.trim().length > 0
    )
  };
}

function resolveTokenCipherKey() {
  const rawMaterial = process.env.TOKEN_ENCRYPTION_KEY?.trim() || process.env.DISCORD_CLIENT_SECRET?.trim();

  if (!rawMaterial) {
    if (!runtimeState.tokenEncryptionWarningShown) {
      console.warn("[security] TOKEN_ENCRYPTION_KEY (or DISCORD_CLIENT_SECRET) is missing; token values will be stored as plain text.");
      runtimeState.tokenEncryptionWarningShown = true;
    }
    return null;
  }

  return crypto.createHash("sha256").update(rawMaterial).digest();
}

function encryptTokenValue(value: string) {
  const normalized = value.trim();

  if (!normalized || normalized.startsWith(tokenCipherPrefix)) {
    return normalized;
  }

  const key = resolveTokenCipherKey();
  if (!key) {
    return normalized;
  }

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${tokenCipherPrefix}${Buffer.concat([iv, tag, encrypted]).toString("base64")}`;
}

function decryptTokenValue(value: string) {
  const normalized = value.trim();

  if (!normalized) {
    return "";
  }

  if (!normalized.startsWith(tokenCipherPrefix)) {
    return normalized;
  }

  const key = resolveTokenCipherKey();
  if (!key) {
    return "";
  }

  try {
    const payload = Buffer.from(normalized.slice(tokenCipherPrefix.length), "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return "";
  }
}

async function saveStore(store: Store) {
  await ensureStoreFile();

  const serializableStore: Store = {
    ...store,
    accounts: store.accounts.map((account) => ({
      ...account,
      tokenValue: encryptTokenValue(account.tokenValue)
    }))
  };

  runtimeState.storeWriteQueue = (runtimeState.storeWriteQueue ?? Promise.resolve()).then(async () => {
    const tempStoreFile = `${storeFile}.tmp`;
    const payload = JSON.stringify(serializableStore, null, 2);
    await writeFile(tempStoreFile, payload, "utf8");

    try {
      await rename(tempStoreFile, storeFile);
    } catch (error) {
      const isLockedRenameError =
        error instanceof Error &&
        "code" in error &&
        ((error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "EBUSY");

      if (!isLockedRenameError) {
        throw error;
      }

      // OneDrive/AV can lock rename on Windows; fallback keeps persistence working.
      await writeFile(storeFile, payload, "utf8");
      await rm(tempStoreFile, { force: true }).catch(() => undefined);
    }
  });

  await runtimeState.storeWriteQueue;
}

function trimActivities(activities: Store["activities"]) {
  return activities.slice(0, 8);
}

function sanitizeAccounts(accounts: Store["accounts"]) {
  return accounts.map(({ tokenValue: _tokenValue, ...account }) => account);
}

function trimSession(token: string) {
  return token.trim();
}

function resolveSessionRecord(store: Store, sessionToken: string) {
  const normalizedToken = trimSession(sessionToken);
  const now = new Date();

  return store.sessions.find((item) => item.token === normalizedToken && new Date(item.expiresAt) > now) ?? null;
}

function getVoiceTargetForUser(store: Store, discordId: string) {
  return store.userVoiceTargets.find((item) => item.discordId === discordId) ?? null;
}

function upsertVoiceTargetForUser(store: Store, discordId: string, serverName: string, voiceChannel: string) {
  const existingIndex = store.userVoiceTargets.findIndex((item) => item.discordId === discordId);
  const next = {
    discordId,
    serverName,
    voiceChannel,
    updatedAt: new Date().toISOString()
  };

  if (existingIndex >= 0) {
    store.userVoiceTargets[existingIndex] = next;
  } else {
    store.userVoiceTargets.unshift(next);
  }
}

function resolvePackageProfile(store: Store, discordId: string): PackageProfile {
  const assignment = store.packageAssignments.find((item) => item.discordId === discordId);

  if (!assignment) {
    const fallback = packageDefaults.free;
    return {
      tier: "free",
      name: fallback.name,
      active: true,
      limit: fallback.limit
    };
  }

  return {
    tier: assignment.tier,
    name: assignment.name || packageDefaults[assignment.tier].name,
    active: assignment.active,
    limit: Math.max(1, assignment.limit)
  };
}

function resolveAdminFlag(store: Store, discordId: string) {
  return store.packageAssignments.some((item) => item.discordId === discordId && item.role === "admin");
}

function buildAvatarUrl(discordId: string, avatarHash: string | null) {
  if (!avatarHash) {
    return null;
  }

  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png`;
}

async function buildSessionPayload(store: Store, sessionToken: string) {
  const session = resolveSessionRecord(store, sessionToken);

  if (!session) {
    return null;
  }

  const packageProfile = resolvePackageProfile(store, session.discordId);
  const isAdmin = resolveAdminFlag(store, session.discordId);

  let activeAccountIds = new Set<string>();
  try {
    const { getActiveAccountIds } = await import("@/lib/discord-runtime");
    activeAccountIds = new Set(getActiveAccountIds());
  } catch {
    activeAccountIds = new Set<string>();
  }

  let hasStatusChange = false;
  store.accounts = store.accounts.map((account) => {
    if (account.ownerDiscordId !== session.discordId) {
      return account;
    }

    const hasToken = account.tokenValue.trim().length > 0;
    const nextStatus = activeAccountIds.has(account.id) ? "live" : hasToken ? "ready" : "idle";

    if (account.status !== nextStatus) {
      hasStatusChange = true;
      return { ...account, status: nextStatus };
    }

    return account;
  });

  if (hasStatusChange) {
    await saveStore(store);
  }

  const savedVoiceTarget = getVoiceTargetForUser(store, session.discordId);

  return {
    sessionToken: session.token,
    loginName: session.userName,
    avatarUrl: session.avatarUrl,
    discordId: session.discordId,
    isAdmin,
    packageTier: packageProfile.tier,
    packageConfig: {
      name: packageProfile.name,
      active: packageProfile.active,
      limit: packageProfile.limit,
      serverName: savedVoiceTarget?.serverName ?? "",
      voiceChannel: savedVoiceTarget?.voiceChannel ?? ""
    },
    accounts: sanitizeAccounts(
      store.accounts
        .filter((account) => account.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    ),
    activities: trimActivities(
      store.activities
        .filter((activity) => activity.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    ),
    joinJobs: store.joinJobs
      .filter((job) => job.ownerDiscordId === session.discordId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  };
}

export async function seedStore() {
  const store = await readStore();
  await saveStore(store);
  return store;
}

export async function createOAuthState() {
  const store = await seedStore();
  const state = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString();

  store.oauthStates = store.oauthStates.filter((item) => new Date(item.expiresAt) > new Date()).slice(0, 20);
  store.oauthStates.unshift({ state, expiresAt });
  await saveStore(store);

  return state;
}

export async function consumeOAuthState(state: string) {
  const store = await seedStore();
  const now = new Date();
  const match = store.oauthStates.find((item) => item.state === state && new Date(item.expiresAt) > now);

  store.oauthStates = store.oauthStates.filter((item) => item.state !== state && new Date(item.expiresAt) > now);
  await saveStore(store);

  return Boolean(match);
}

export async function createDiscordSession(discordUser: { id: string; username: string; avatar: string | null }) {
  const store = await seedStore();
  const packageProfile = resolvePackageProfile(store, discordUser.id);
  const sessionToken = createToken();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();

  store.sessions.unshift({
    token: sessionToken,
    userName: discordUser.username,
    avatarUrl: buildAvatarUrl(discordUser.id, discordUser.avatar),
    discordId: discordUser.id,
    packageTier: packageProfile.tier,
    packageLimit: packageProfile.limit,
    expiresAt
  });

  store.activities.unshift({
    id: createId(),
    ownerDiscordId: discordUser.id,
    sessionToken,
    title: "Discord ile giriş tamamlandı",
    detail: `${discordUser.username} hesabı ile ${packageProfile.name} paketine giriş yapıldı.`,
    tone: "live",
    createdAt: new Date().toISOString()
  });

  await saveStore(store);
  return buildSessionPayload(store, sessionToken);
}

export async function getSession(sessionToken: string) {
  const store = await seedStore();
  return buildSessionPayload(store, sessionToken);
}

export async function removeSession(sessionToken: string) {
  const store = await seedStore();
  const normalizedToken = trimSession(sessionToken);
  const session = resolveSessionRecord(store, normalizedToken);

  if (!session) {
    store.sessions = store.sessions.filter((item) => item.token !== normalizedToken);
    await saveStore(store);
    return;
  }

  const { disconnectAccount } = await import("@/lib/discord-runtime");
  const accountIdsToStop = store.accounts
    .filter((account) => account.ownerDiscordId === session.discordId)
    .map((account) => account.id);

  accountIdsToStop.forEach((accountId) => {
    disconnectAccount(accountId);
  });

  store.accounts = store.accounts.map((account) => {
    if (account.ownerDiscordId !== session.discordId) {
      return account;
    }

    const hasToken = account.tokenValue.trim().length > 0;
    return { ...account, status: hasToken ? "ready" : "idle" };
  });

  store.sessions = store.sessions.filter((item) => item.token !== normalizedToken);
  await saveStore(store);
}

export async function addAccounts(sessionToken: string, tokenLabel: string, username: string, quantity = 1, tokenValue?: string) {
  const store = await seedStore();
  const session = await getSession(sessionToken);

  if (!session) {
    return null;
  }

  const effectiveLimit = session.packageConfig.active ? Math.max(1, session.packageConfig.limit) : 1;
  const currentCount = store.accounts.filter((account) => account.ownerDiscordId === session.discordId).length;
  const available = Math.max(effectiveLimit - currentCount, 0);
  const amount = Math.min(Math.max(1, quantity), available);

  if (amount <= 0) {
    return {
      ok: false,
      message: "Limit doldu",
      accounts: session.accounts,
      activities: session.activities,
      packageConfig: session.packageConfig,
      remainingSlots: 0
    };
  }

  const created = Array.from({ length: amount }, (_, index) => ({
    id: createId(),
    ownerDiscordId: session.discordId,
    sessionToken: session.sessionToken,
    tokenLabel: amount === 1 ? tokenLabel.trim() || `token-${currentCount + index + 1}` : `${tokenLabel.trim() || "bulk-token"}-${index + 1}`,
    tokenValue: amount === 1 ? (tokenValue ?? tokenLabel).trim() : "",
    username: amount === 1 ? username.trim() || `Account ${currentCount + index + 1}` : `${username.trim() || "Bulk Account"} ${index + 1}`,
    status: amount === 1 && (tokenValue ?? tokenLabel).trim() ? ("ready" as const) : ("idle" as const),
    createdAt: new Date().toISOString()
  }));

  store.accounts.unshift(...created);
  store.activities.unshift({
    id: createId(),
    ownerDiscordId: session.discordId,
    sessionToken: session.sessionToken,
    title: amount === 1 ? "Hesap eklendi" : "Toplu token eklendi",
    detail: amount === 1 ? `${created[0].username} için token slotu oluşturuldu.` : `${created.length} yeni hesap slotu açıldı.`,
    tone: "ok",
    createdAt: new Date().toISOString()
  });

  await saveStore(store);

  const accounts = store.accounts
    .filter((account) => account.ownerDiscordId === session.discordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const activities = trimActivities(
    store.activities
      .filter((activity) => activity.ownerDiscordId === session.discordId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  );

  return {
    ok: true,
    accounts: sanitizeAccounts(accounts),
    activities,
    packageConfig: session.packageConfig,
    remainingSlots: Math.max(effectiveLimit - accounts.length, 0)
  };
}

export async function createJoinJob(
  sessionToken: string,
  serverName: string,
  voiceChannel: string,
  streamModeEnabled = false,
  cameraModeEnabled = false
) {
  const store = await seedStore();
  const session = await getSession(sessionToken);
  const { connectAccountToVoice } = await import("@/lib/discord-runtime");
  const normalizedServerName = serverName.trim();
  const normalizedVoiceChannel = voiceChannel.trim();

  if (!session) {
    return null;
  }

  const sessionAccounts = store.accounts
    .filter((account) => account.ownerDiscordId === session.discordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const joinableAccounts = sessionAccounts.filter((account) => account.tokenValue.trim());
  const accountCount = joinableAccounts.length;

  if (accountCount <= 0) {
    return {
      ok: false,
      message: "Gecerli bot tokeni olan hesap yok",
      activities: session.activities
    };
  }

  let successCount = 0;
  let modeWarningCount = 0;
  const requestedModes: string[] = [];

  if (streamModeEnabled) {
    requestedModes.push("yayin");
  }
  if (cameraModeEnabled) {
    requestedModes.push("kamera");
  }

  const modeText = requestedModes.length > 0 ? ` (mod: ${requestedModes.join(" + ")})` : "";

  for (const account of joinableAccounts) {
    try {
      const runtimeResult = await connectAccountToVoice({
        accountId: account.id,
        token: account.tokenValue,
        guildId: normalizedServerName,
        channelId: normalizedVoiceChannel,
        enableStream: streamModeEnabled,
        enableCamera: cameraModeEnabled
      });

      successCount += 1;
      if ((runtimeResult.modeWarnings ?? []).length > 0) {
        modeWarningCount += 1;
        store.activities.unshift({
          id: createId(),
          ownerDiscordId: session.discordId,
          sessionToken: session.sessionToken,
          title: `${account.username} mod uyarisi`,
          detail: `${runtimeResult.modeWarnings.join(", ")} (ses baglantisi aktif).`,
          tone: "warn",
          createdAt: new Date().toISOString()
        });
      }
      store.accounts = store.accounts.map((item) =>
        item.id === account.id && item.ownerDiscordId === session.discordId ? { ...item, status: "live" } : item
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bilinmeyen hata";
      const hasToken = account.tokenValue.trim().length > 0;
      store.accounts = store.accounts.map((item) =>
        item.id === account.id && item.ownerDiscordId === session.discordId
          ? { ...item, status: hasToken ? "ready" : "idle" }
          : item
      );
      store.activities.unshift({
        id: createId(),
        ownerDiscordId: session.discordId,
        sessionToken: session.sessionToken,
        title: `${account.username} baglanamadi`,
        detail: message,
        tone: "warn",
        createdAt: new Date().toISOString()
      });
    }
  }

  const joinJob = {
    id: createId(),
    ownerDiscordId: session.discordId,
    sessionToken: session.sessionToken,
    serverName: normalizedServerName,
    voiceChannel: normalizedVoiceChannel,
    accountCount,
    status: successCount > 0 ? "connected" : "failed",
    createdAt: new Date().toISOString()
  };

  upsertVoiceTargetForUser(store, session.discordId, normalizedServerName, normalizedVoiceChannel);

  store.joinJobs.unshift(joinJob);
  store.activities.unshift({
    id: createId(),
    ownerDiscordId: session.discordId,
    sessionToken: session.sessionToken,
    title: successCount > 0 ? "Ses kanalina baglanildi" : "Ses kanalina baglanma basarisiz",
    detail:
      successCount > 0
        ? modeWarningCount > 0
          ? `${successCount}/${accountCount} bot baglandi${modeText}. ${modeWarningCount} hesapta yayin/kamera sinirli kaldi.`
          : `${successCount}/${accountCount} bot baglandi${modeText}.`
        : `Hicbir bot ses kanalina baglanamadi${modeText}. Token ve izinleri kontrol edin.`,
    tone: successCount > 0 ? "live" : "warn",
    createdAt: new Date().toISOString()
  });

  await saveStore(store);

  const refreshedAccounts = store.accounts
    .filter((account) => account.ownerDiscordId === session.discordId)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  return {
    ok: true,
    joinJob,
    accounts: sanitizeAccounts(refreshedAccounts),
    activities: trimActivities(
      store.activities
        .filter((activity) => activity.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    ),
    message:
      successCount > 0
        ? modeWarningCount > 0
          ? `${successCount} bot ses kanalina baglandi${modeText}. Bazi hesaplarda yayin/kamera acilamadi.`
          : `${successCount} bot ses kanalina baglandi${modeText}.`
        : `Baglanti basarisiz${modeText}. Token, sunucu ve kanal bilgilerini kontrol edin.`
  };
}

export async function removeAccount(sessionToken: string, accountId: string) {
  const store = await seedStore();
  const session = await getSession(sessionToken);
  const { disconnectAccount } = await import("@/lib/discord-runtime");

  if (!session) {
    return null;
  }

  const exists = store.accounts.some((account) => account.id === accountId && account.ownerDiscordId === session.discordId);

  if (!exists) {
    return {
      ok: false,
      message: "Hesap bulunamadi"
    };
  }

  store.accounts = store.accounts.filter((account) => !(account.id === accountId && account.ownerDiscordId === session.discordId));
  disconnectAccount(accountId);
  store.activities.unshift({
    id: createId(),
    ownerDiscordId: session.discordId,
    sessionToken: session.sessionToken,
    title: "Hesap durduruldu",
    detail: `${accountId} kimlikli hesap listeden cikartildi.`,
    tone: "warn",
    createdAt: new Date().toISOString()
  });

  await saveStore(store);

  return {
    ok: true,
    accounts: sanitizeAccounts(
      store.accounts
        .filter((account) => account.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    ),
    activities: trimActivities(
      store.activities
        .filter((activity) => activity.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    )
  };
}

export async function updateAccountMeta(
  sessionToken: string,
  accountId: string,
  payload: { tokenLabel?: string; username?: string }
) {
  const store = await seedStore();
  const session = await getSession(sessionToken);

  if (!session) {
    return null;
  }

  const index = store.accounts.findIndex(
    (account) => account.id === accountId && account.ownerDiscordId === session.discordId
  );

  if (index < 0) {
    return {
      ok: false,
      message: "Hesap bulunamadi"
    };
  }

  const current = store.accounts[index];
  const nextTokenLabel =
    typeof payload.tokenLabel === "string" && payload.tokenLabel.trim()
      ? payload.tokenLabel.trim()
      : current.tokenLabel;
  const nextUsername =
    typeof payload.username === "string" && payload.username.trim()
      ? payload.username.trim()
      : current.username;

  store.accounts[index] = {
    ...current,
    tokenLabel: nextTokenLabel,
    username: nextUsername
  };

  store.activities.unshift({
    id: createId(),
    ownerDiscordId: session.discordId,
    sessionToken: session.sessionToken,
    title: "Hesap bilgisi guncellendi",
    detail: `${nextUsername} icin etiket ve ad bilgisi kaydedildi.`,
    tone: "ok",
    createdAt: new Date().toISOString()
  });

  await saveStore(store);

  return {
    ok: true,
    accounts: sanitizeAccounts(
      store.accounts
        .filter((account) => account.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    ),
    activities: trimActivities(
      store.activities
        .filter((activity) => activity.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    )
  };
}

export async function stopAllAccounts(sessionToken: string) {
  const store = await seedStore();
  const session = await getSession(sessionToken);
  const { disconnectAccount } = await import("@/lib/discord-runtime");

  if (!session) {
    return null;
  }

  const accountIdsToStop = store.accounts
    .filter((account) => account.ownerDiscordId === session.discordId)
    .map((account) => account.id);

  accountIdsToStop.forEach((accountId) => {
    disconnectAccount(accountId);
  });

  store.accounts = store.accounts.map((account) => {
    if (account.ownerDiscordId !== session.discordId) {
      return account;
    }

    const hasToken = account.tokenValue.trim().length > 0;
    return { ...account, status: hasToken ? "ready" : "idle" };
  });

  store.activities.unshift({
    id: createId(),
    ownerDiscordId: session.discordId,
    sessionToken: session.sessionToken,
    title: "Tum botlar durduruldu",
    detail: "Oturumdaki tum hesaplar sesten cikarildi; tokeni olanlar hazir duruma alindi.",
    tone: "warn",
    createdAt: new Date().toISOString()
  });

  await saveStore(store);

  return {
    ok: true,
    accounts: sanitizeAccounts(
      store.accounts
        .filter((account) => account.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    ),
    activities: trimActivities(
      store.activities
        .filter((activity) => activity.ownerDiscordId === session.discordId)
        .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    )
  };
}

export async function getAccountTokenForSession(sessionToken: string, accountId: string) {
  const store = await seedStore();
  const session = await getSession(sessionToken);

  if (!session) {
    return null;
  }

  const account = store.accounts.find(
    (item) => item.id === accountId && item.ownerDiscordId === session.discordId
  );

  if (!account) {
    return {
      ok: false,
      message: "Hesap bulunamadi"
    } as const;
  }

  const tokenValue = account.tokenValue.trim();

  if (!tokenValue) {
    return {
      ok: false,
      message: "Secilen hesapta gecerli token yok"
    } as const;
  }

  return {
    ok: true,
    tokenValue,
    account: {
      id: account.id,
      tokenLabel: account.tokenLabel,
      username: account.username,
      status: account.status
    }
  } as const;
}

export async function updatePackageConfig(data: {
  name: string;
  active: boolean;
  limit: number;
  serverName: string;
  voiceChannel: string;
}) {
  const store = await seedStore();

  store.packageConfig = {
    name: data.name,
    active: data.active,
    limit: Math.max(1, data.limit),
    serverName: data.serverName,
    voiceChannel: data.voiceChannel
  };

  await saveStore(store);
  return store.packageConfig;
}

export async function assignPackage(data: {
  discordId: string;
  userName: string;
  tier: PackageTier;
  customLimit?: number;
  role?: AdminRole;
}) {
  const store = await seedStore();
  const normalizedDiscordId = data.discordId.trim();

  if (!normalizedDiscordId) {
    return null;
  }

  const baseProfile = packageDefaults[data.tier];
  const limit = data.tier === "premium" && typeof data.customLimit === "number" ? Math.max(1, data.customLimit) : baseProfile.limit;
  const role: AdminRole = data.role === "admin" ? "admin" : "user";

  const assignment: Store["packageAssignments"][number] = {
    discordId: normalizedDiscordId,
    userName: data.userName.trim(),
    tier: data.tier,
    name: baseProfile.name,
    limit,
    active: true,
    role,
    updatedAt: new Date().toISOString()
  };

  const existingIndex = store.packageAssignments.findIndex((item) => item.discordId === normalizedDiscordId);

  if (existingIndex >= 0) {
    store.packageAssignments[existingIndex] = assignment;
  } else {
    store.packageAssignments.unshift(assignment);
  }

  await saveStore(store);
  return assignment;
}
