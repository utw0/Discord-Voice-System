"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AccountEntry = {
  id: string;
  tokenLabel: string;
  username: string;
  status: "idle" | "ready" | "live";
};

type ActivityEntry = {
  id: string;
  title: string;
  detail: string;
  tone: "ok" | "warn" | "live";
};

type AccountEditDraft = {
  tokenLabel: string;
  username: string;
};

type JoinJobEntry = {
  serverName: string;
  voiceChannel: string;
  status: string;
};

const initialAccounts: AccountEntry[] = [];

const authErrorMessages: Record<string, string> = {
  config: "Discord OAuth ayarları eksik veya hatalı. Client ID ve redirect URI bilgilerini kontrol et.",
  state: "OAuth doğrulaması başarısız oldu. Girişi yeniden başlat.",
  expired: "OAuth oturum durumu süresi doldu. Tekrar Discord ile giriş yap.",
  token: "Discord token alınamadı. Client Secret veya callback URL uyuşmuyor olabilir.",
  user: "Discord kullanıcı bilgisi alınamadı.",
  session: "Uygulama oturumu oluşturulamadı.",
  forbidden: "Bu panel yalnızca admin kullanıcılar içindir. Hesabının admin yetkisi yok."
};

export function VoiceControlDashboard({ adminMode = false }: { adminMode?: boolean }) {
  const [authLoading, setAuthLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginName, setLoginName] = useState("Discord Kullanıcısı");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessionDiscordId, setSessionDiscordId] = useState("");
  const [packageTier, setPackageTier] = useState<"free" | "classic" | "premium">("free");
  const [adminRole, setAdminRole] = useState<"user" | "admin">("user");
  const [planName, setPlanName] = useState("Luhux Premium Pack");
  const [packageActive, setPackageActive] = useState(true);
  const [limit, setLimit] = useState(3);
  const [serverName, setServerName] = useState("");
  const [voiceChannel, setVoiceChannel] = useState("");
  const [accounts, setAccounts] = useState<AccountEntry[]>(initialAccounts);
  const [accountLabel, setAccountLabel] = useState("");
  const [tokenSecret, setTokenSecret] = useState("");
  const [username, setUsername] = useState("");
  const [accountCount, setAccountCount] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<AccountEditDraft>({ tokenLabel: "", username: "" });
  const [liveTarget, setLiveTarget] = useState<{ serverName: string; voiceChannel: string } | null>(null);
  const [joinNotice, setJoinNotice] = useState<{ tone: "ok" | "warn" | "live"; text: string } | null>(null);
  const [streamModeEnabled, setStreamModeEnabled] = useState(true);
  const [cameraModeEnabled, setCameraModeEnabled] = useState(true);
  const [activities, setActivities] = useState<ActivityEntry[]>([
    {
      id: "act-1",
      title: "Sistem hazır",
      detail: "Panel hazır. Token ekleyebilirsin.",
      tone: "ok"
    }
  ]);

  const effectiveLimit = packageActive ? Math.max(1, limit) : 1;
  const remainingSlots = Math.max(effectiveLimit - accounts.length, 0);
  const statusLabel = packageActive ? `${effectiveLimit} hesap limiti aktif` : "Paketsiz mod: 1 hesap";
  const hasReadyAccount = accounts.some((account) => account.status === "ready");

  const canAddMore = accounts.length < effectiveLimit;

  const hydrateSession = (data: {
    loginName: string;
    discordId: string;
    packageTier: "free" | "classic" | "premium";
    avatarUrl?: string | null;
    packageConfig: {
      name: string;
      active: boolean;
      limit: number;
      serverName: string;
      voiceChannel: string;
    };
    joinJobs?: JoinJobEntry[];
    accounts: AccountEntry[];
    activities: Array<{ id: string; title: string; detail: string; tone: string }>;
  }) => {
    const latestConnectedJob = (data.joinJobs ?? []).find((job) => job.status === "connected");

    setLoggedIn(true);
    setLoginName(data.loginName);
    setSessionDiscordId(data.discordId);
    setPackageTier(data.packageTier);
    setAvatarUrl(data.avatarUrl ?? null);
    setPlanName(data.packageConfig.name);
    setPackageActive(data.packageConfig.active);
    setLimit(data.packageConfig.limit);
    setServerName(data.packageConfig.serverName || "");
    setVoiceChannel(data.packageConfig.voiceChannel || "");
    setLiveTarget(
      latestConnectedJob
        ? { serverName: latestConnectedJob.serverName, voiceChannel: latestConnectedJob.voiceChannel }
        : null
    );
    setAccounts(data.accounts ?? initialAccounts);
    setActivities(
      (data.activities ?? []).map((activity) => ({
        id: activity.id,
        title: activity.title,
        detail: activity.detail,
        tone: activity.tone as ActivityEntry["tone"]
      }))
    );
  };

  useEffect(() => {
    const init = async () => {
      const params = new URLSearchParams(window.location.search);
      const authErrorCode = params.get("authError");

      if (authErrorCode) {
        setAuthError(authErrorMessages[authErrorCode] ?? "Discord girişi tamamlanamadı. Uygulama ayarlarını kontrol et.");
      }

      const response = await fetch("/api/auth/session");

      if (!response.ok) {
        setAuthLoading(false);
        return;
      }

      const data = await response.json();
      hydrateSession(data);
      setAuthLoading(false);
    };

    init();
  }, []);
  const filteredAccounts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    if (!term) {
      return accounts;
    }

    return accounts.filter((account) => {
      return [account.tokenLabel, account.username, serverName, voiceChannel].some((value) =>
        value.toLowerCase().includes(term)
      );
    });
  }, [accounts, searchTerm, serverName, voiceChannel]);

  const pushActivity = (title: string, detail: string, tone: ActivityEntry["tone"] = "ok") => {
    setActivities((current) => [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
        title,
        detail,
        tone
      },
      ...current.slice(0, 4)
    ]);
  };

  const mapActivities = (incoming: Array<{ id: string; title: string; detail: string; tone: string }> = []) => {
    return incoming.map((activity) => ({
      id: activity.id,
      title: activity.title,
      detail: activity.detail,
      tone: activity.tone as ActivityEntry["tone"]
    }));
  };

  const resetAddForm = () => {
    setAccountLabel("");
    setTokenSecret("");
    setUsername("");
    setAccountCount(1);
  };

  const refreshAccounts = async () => {
    const response = await fetch("/api/accounts");

    if (!response.ok) {
      pushActivity("Liste yenilenemedi", "Oturum veya ag baglantisi kontrol edilmeli.", "warn");
      return;
    }

    const data = await response.json();
    setAccounts(data.accounts ?? []);
    setActivities(mapActivities(data.activities ?? []));
    pushActivity("Liste yenilendi", "Kullanici paneli sunucuyla senkronize edildi.", "ok");
  };

  const handleLogin = () => {
    window.location.href = "/api/auth/discord/login";
  };

  const handleLogout = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    setLoggedIn(false);
    setAvatarUrl(null);
    setSessionDiscordId("");
    setPackageTier("free");
    setServerName("");
    setVoiceChannel("");
    setLiveTarget(null);
    setJoinNotice(null);
    setAccounts(initialAccounts);
    setActivities([
      {
        id: "act-1",
        title: "Sistem hazır",
          detail: "Panel hazır. Token ekleyebilirsin.",
        tone: "ok"
      }
    ]);
  };

  const handleAddAccount = async () => {
    if (!loggedIn) {
      pushActivity("Oturum yok", "Önce giriş yapmalısın.", "warn");
      return;
    }

    if (!tokenSecret.trim()) {
      pushActivity("Token eksik", "Gercek bot tokeni girmeden hesap eklenemez.", "warn");
      return;
    }

    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tokenLabel: accountLabel,
        tokenValue: tokenSecret,
        username,
        quantity: 1
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      pushActivity("Limit doldu", data.message || "Admin paket limiti kadar hesap eklendi.", "warn");
      return;
    }

    setAccounts(data.accounts ?? []);
    setActivities(mapActivities(data.activities ?? []));
    resetAddForm();
    setLimit(data.packageConfig?.limit ?? limit);
    setPackageActive(data.packageConfig?.active ?? packageActive);
    pushActivity("Hesap eklendi", `${username.trim() || "Yeni hesap"} için token slotu oluşturuldu.`, "ok");
  };

  const handleBulkAdd = async () => {
    if (!loggedIn) {
      pushActivity("Oturum yok", "Önce giriş yapmalısın.", "warn");
      return;
    }

    const amount = Math.max(1, accountCount);
    const response = await fetch("/api/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tokenLabel: "bulk-token",
        username: "Bulk Account",
        quantity: amount
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      pushActivity("Toplu ekleme reddedildi", data.message || "Limit nedeniyle yeni hesap açılamadı.", "warn");
      return;
    }

    setAccounts(data.accounts ?? []);
    setActivities(mapActivities(data.activities ?? []));
    resetAddForm();
    pushActivity("Toplu token eklendi", `${Math.min(amount, data.remainingSlots + amount)} yeni hesap slotu açıldı.`, "ok");
  };

  const handleLeaveVoice = async () => {
    if (!loggedIn) {
      pushActivity("Oturum yok", "Önce giriş yapmalısın.", "warn");
      return;
    }

    const response = await fetch("/api/accounts/stop-all", { method: "POST" });
    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      setJoinNotice({ tone: "warn", text: data?.message || "Sesten cikarma islemi tamamlanamadi." });
      pushActivity("Sesten cikarma basarisiz", data?.message || "Islem sunucu tarafinda tamamlanamadi.", "warn");
      return;
    }

    setAccounts(data.accounts ?? []);
    setActivities(mapActivities(data.activities ?? []));
    setLiveTarget(null);
    setJoinNotice({ tone: "warn", text: "Tum hesaplar sesten cikarildi." });
    pushActivity("Sesten cikarildi", "Tokeni olan hesaplar hazir moda alindi.", "warn");
  };

  const startEditAccount = (account: AccountEntry) => {
    setEditingAccountId(account.id);
    setEditDraft({ tokenLabel: account.tokenLabel, username: account.username });
  };

  const cancelEditAccount = () => {
    setEditingAccountId(null);
    setEditDraft({ tokenLabel: "", username: "" });
  };

  const saveEditedAccount = async (accountId: string) => {
    const response = await fetch(`/api/accounts/${accountId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        tokenLabel: editDraft.tokenLabel,
        username: editDraft.username
      })
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.ok) {
      pushActivity("Guncelleme basarisiz", data?.message || "Hesap bilgileri kaydedilemedi.", "warn");
      return;
    }

    setAccounts(data.accounts ?? []);
    setActivities(mapActivities(data.activities ?? []));
    cancelEditAccount();
    pushActivity("Hesap guncellendi", "Aktif bot bilgileri kaydedildi.", "ok");
  };

  const handleJoinVoice = async () => {
    if (!loggedIn) {
      pushActivity("Oturum yok", "Önce giriş yapmalısın.", "warn");
      return;
    }

    const response = await fetch("/api/discord/join", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        serverName,
        voiceChannel,
        streamModeEnabled,
        cameraModeEnabled
      })
    });

    const data = await response.json().catch(() => null);

    if (response.ok) {
      if (data?.accounts) {
        setAccounts(data.accounts);
      }
      setActivities(mapActivities(data?.activities ?? []));
      const failed = data?.joinJob?.status === "failed";
      if (!failed && data?.joinJob?.serverName && data?.joinJob?.voiceChannel) {
        setLiveTarget({ serverName: data.joinJob.serverName, voiceChannel: data.joinJob.voiceChannel });
      }
      setJoinNotice({
        tone: failed ? "warn" : "live",
        text: failed ? data?.message || "Ses baglantisi basarisiz oldu." : data?.message || "Botlar sese basariyla girdi."
      });
      pushActivity(
        failed ? "Ses baglantisi basarisiz" : "Sese giris yapildi",
        data?.message || `${voiceChannel} hedefi icin baglanti denemesi tamamlandi.`,
        failed ? "warn" : "live"
      );
      return;
    }

    if (data?.activities) {
      setActivities(mapActivities(data.activities));
    }
    setJoinNotice({ tone: "warn", text: data?.message || "Sese girme istegi basarisiz." });
    pushActivity("Islem basarisiz", data?.message || "Sunucuya baglanma istegi reddedildi.", "warn");
  };

  const visibleAccounts = useMemo(() => filteredAccounts, [filteredAccounts]);
  const visibleActivities = useMemo(() => activities.slice(0, 3), [activities]);
  const hiddenActivityCount = Math.max(activities.length - visibleActivities.length, 0);
  const packageTierLabel = packageTier === "free" ? "Free" : packageTier === "classic" ? "Classic" : "Premium";

  if (authLoading) {
    return (
      <main className="auth-shell">
        <section className="panel auth-card" style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
          <p className="subtle">Oturum kontrol ediliyor...</p>
        </section>
      </main>
    );
  }

  if (!loggedIn) {
    return (
      <main className="auth-shell">
        <div className="auth-orb auth-orb-left" />
        <div className="auth-orb auth-orb-right" />

        <section className="panel auth-card">
          <div className="auth-brand">
            <span className="brand-mark">L</span>
            <div>
              <div className="eyebrow">Luhux Token Control</div>
              <h1>Discord ile giriş yap, token ve ses kontrolünü tek yerden yönet.</h1>
              <p>
                Giriş yalnızca Discord OAuth ile yapılır. Paketsiz hesapta tek token, paket aktifse admin limitine göre
                çoklu hesap kullanılır.
              </p>
            </div>
          </div>

          <div className="auth-points">
            <div className="auth-point">
              <span className="auth-dot" />
              <div>
                <strong>Tek token modu</strong>
                <span>Paketsiz kullanıcılar için sade akış.</span>
              </div>
            </div>
            <div className="auth-point">
              <span className="auth-dot accent" />
              <div>
                <strong>Admin limitleri</strong>
                <span>Pakete göre hesap sayısı açılır.</span>
              </div>
            </div>
            <div className="auth-point">
              <span className="auth-dot success" />
              <div>
                <strong>Ses hedefi</strong>
                <span>Belirtilen sunucu ve kanala bağlanma akışı.</span>
              </div>
            </div>
          </div>

          <div className="auth-form">
            <div className="auth-actions">
              {authError ? <p className="subtle">{authError}</p> : null}
              <button className="btn btn-full auth-discord-btn" onClick={handleLogin}>
                <span className="auth-discord-icon" aria-hidden="true">
                  D
                </span>
                <span className="auth-discord-copy">
                  <strong className="auth-discord-text">Discord ile Giris Yap</strong>
                  <small className="auth-discord-sub">Luhux Token Control paneline guvenli baglan</small>
                </span>
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar panel">
        <div className="topbar-left">
          <div className="logo-badge">L</div>
          <div>
            <div className="eyebrow">Luhux Token Control</div>
            <strong>{planName}</strong>
          </div>
        </div>

        <div className="topbar-center">
          <span className="status-chip live">Online</span>
          <span className="status-chip">{packageTierLabel}</span>
          <span className="status-chip">{statusLabel}</span>
          <span className="status-chip">{accounts.length} aktif kullanıcı</span>
        </div>

        <div className="topbar-right">
          <span className="profile-chip">
            <span className="profile-avatar" style={avatarUrl ? { backgroundImage: `url(${avatarUrl})`, backgroundSize: "cover" } : undefined}>
              {!avatarUrl ? loginName.slice(0, 1).toUpperCase() : null}
            </span>
            <span>
              <strong>{loginName}</strong>
              <small>{loggedIn ? "Discord bağlı" : "Bağlı değil"}</small>
            </span>
          </span>
          <Link className="btn topbar-tool-link" href="/dm-cleaner">
            DM Temizleyici
          </Link>
          <button className="btn" onClick={handleLogout}>
            Çıkış
          </button>
        </div>
      </header>

      <section className="workspace-grid">
        <article className="panel workspace-main">
          <div className="workspace-head">
            <div>
              <span className="eyebrow">Oturum</span>
              <h1>Giris yapildi, ses ve hesap yonetimi aktif.</h1>
            </div>
          </div>

          <div className="info-strip">
            <div>
              <span className="label">Sunucu ID</span>
              <strong>{serverName || "-"}</strong>
            </div>
            <div>
              <span className="label">Ses Kanalı ID</span>
              <strong>{voiceChannel || "-"}</strong>
            </div>
            <div>
              <span className="label">Aktif Botlar</span>
              <strong>{accounts.length} / {effectiveLimit}</strong>
            </div>
          </div>

          <div className="workspace-actions">
            <button
              className="btn btn-primary"
              onClick={handleJoinVoice}
              disabled={!loggedIn || !hasReadyAccount}
              title={!hasReadyAccount ? "Sese girmek icin en az bir hazir hesap gerekir." : undefined}
            >
              Sese Gir
            </button>
            <button className="btn btn-danger" onClick={handleLeaveVoice} disabled={!loggedIn}>
              Sesten Cikar
            </button>
          </div>

          {joinNotice ? <div className={`join-notice ${joinNotice.tone}`}>{joinNotice.text}</div> : null}

          <div className="form-grid">
            <div className="field-block">
              <label>Sunucu ID</label>
              <input className="field" value={serverName} onChange={(event) => setServerName(event.target.value)} placeholder="Guild ID" />
            </div>
            <div className="field-block">
              <label>Ses Kanalı ID</label>
              <input className="field" value={voiceChannel} onChange={(event) => setVoiceChannel(event.target.value)} placeholder="Voice Channel ID" />
            </div>
            <div className={`toggle-card ${streamModeEnabled ? "active" : ""}`}>
              <div className="toggle-copy">
                <strong>Yayın modu</strong>
                <p>Hesabın seste yayında görünmesi için hazırlık.</p>
                <span className={`mode-state ${streamModeEnabled ? "on" : "off"}`}>{streamModeEnabled ? "Yayın açık" : "Yayın kapalı"}</span>
              </div>
              <button
                type="button"
                className={`mode-switch ${streamModeEnabled ? "on" : ""}`}
                aria-label="Yayın modu"
                aria-pressed={streamModeEnabled}
                onClick={() => setStreamModeEnabled((current) => !current)}
              >
                <span className="mode-switch-track">
                  <span className="mode-switch-thumb" />
                </span>
              </button>
            </div>
            <div className={`toggle-card success ${cameraModeEnabled ? "active" : ""}`}>
              <div className="toggle-copy">
                <strong>Kamera modu</strong>
                <p>Kamera açık görünümü için ön ayar.</p>
                <span className={`mode-state ${cameraModeEnabled ? "on" : "off"}`}>{cameraModeEnabled ? "Kamera açık" : "Kamera kapalı"}</span>
              </div>
              <button
                type="button"
                className={`mode-switch ${cameraModeEnabled ? "on" : ""}`}
                aria-label="Kamera modu"
                aria-pressed={cameraModeEnabled}
                onClick={() => setCameraModeEnabled((current) => !current)}
              >
                <span className="mode-switch-track">
                  <span className="mode-switch-thumb" />
                </span>
              </button>
            </div>
          </div>

          <div className="section-title-row">
            <h2>Aktif Botlar</h2>
            <span className="subtle">Bilgiler satir icinden duzenlenebilir.</span>
          </div>

          <div className="token-list">
            {visibleAccounts.length === 0 ? (
              <div className="token-row token-row-wide">
                <div className="muted">Henuz aktif bot yok. Once token ekleyin.</div>
              </div>
            ) : (
              visibleAccounts.map((account) => (
                <div className="token-row token-row-wide" key={account.id}>
                  <div className="token-top">
                    <div className="profile-inline">
                      <span className="profile-avatar small">{account.username.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <div className="token-title">{account.username}</div>
                        <div className="muted">Etiket: {account.tokenLabel}</div>
                      </div>
                    </div>
                    <div className="inline-actions">
                      {editingAccountId === account.id ? (
                        <>
                          <button className="btn btn-small" onClick={() => saveEditedAccount(account.id)}>
                            Kaydet
                          </button>
                          <button className="btn btn-small" onClick={cancelEditAccount}>
                            Iptal
                          </button>
                        </>
                      ) : (
                        <button className="btn btn-small" onClick={() => startEditAccount(account)}>
                          Duzenle
                        </button>
                      )}
                      <button
                        className="btn btn-danger btn-small"
                        onClick={async () => {
                          const response = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
                          const data = await response.json().catch(() => null);

                          if (!response.ok || !data?.ok) {
                            pushActivity("Bot durdurulamadi", data?.message || "Hesap sunucudan kaldirilamadi.", "warn");
                            return;
                          }

                          setAccounts(data.accounts ?? []);
                          setActivities(mapActivities(data.activities ?? []));
                          pushActivity("Bot durduruldu", `${account.username} listeden kaldirildi.`, "warn");
                        }}
                      >
                        Sil
                      </button>
                    </div>
                  </div>
                  {editingAccountId === account.id ? (
                    <div className="account-edit-grid">
                      <input
                        className="field"
                        value={editDraft.tokenLabel}
                        onChange={(event) => setEditDraft((current) => ({ ...current, tokenLabel: event.target.value }))}
                        placeholder="Bot etiketi"
                      />
                      <input
                        className="field"
                        value={editDraft.username}
                        onChange={(event) => setEditDraft((current) => ({ ...current, username: event.target.value }))}
                        placeholder="Hesap adi"
                      />
                    </div>
                  ) : null}
                  <div className="mini-pill-row">
                    <span className={`mini-pill ${account.status === "live" ? "live" : account.status === "ready" ? "ok" : "warn"}`}>
                      Durum: {account.status}
                    </span>
                    <span className="mini-pill">Sunucu: {account.status === "live" ? (liveTarget?.serverName || "-") : "-"}</span>
                    <span className="mini-pill">Kanal: {account.status === "live" ? (liveTarget?.voiceChannel || "-") : "-"}</span>
                    <span className="mini-pill">Limit: {effectiveLimit}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <section className="guide-card">
            <h3>Nasıl Kullanılır?</h3>
            <ul>
              <li>Önce giriş yap.</li>
              <li>Paketse limitini admin tarafından ayarla.</li>
              <li>Tek token veya çoklu token ekle.</li>
              <li>Sunucu ve ses kanalını girip başlat.</li>
            </ul>
          </section>
        </article>

        <aside className="panel workspace-side">
          <div className="side-head">
            <div>
              <span className="eyebrow">Token Yönetimi</span>
              <h2>Giriş sonrası hesap ekleme</h2>
            </div>
            <span className={`badge ${packageActive ? "ok" : "warn"}`}>{packageActive ? planName : "Paketsiz"}</span>
          </div>

          <input
            className="field search-field"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Ara: luhuxbaba,luhuxcuk"
          />

          <div className="field-block compact">
            <label>Token etiketi (istege bagli)</label>
            <input
              className="field"
              autoComplete="off"
              value={accountLabel}
              onChange={(event) => setAccountLabel(event.target.value)}
              placeholder="Örn: _live0"
            />
          </div>

          <div className="field-block compact">
            <label>Token</label>
            <input
              className="field"
              type="password"
              autoComplete="new-password"
              value={tokenSecret}
              onChange={(event) => setTokenSecret(event.target.value)}
              placeholder="Tokenini buraya yapistir"
            />
          </div>

          <div className="field-block compact">
            <label>Hesap adı</label>
            <input
              className="field"
              autoComplete="off"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Örn: Controllerv2"
            />
          </div>

          <div className="field-block compact">
            <label>Toplu eklenecek hesap</label>
            <input className="field" type="number" min={1} value={accountCount} onChange={(event) => setAccountCount(Number(event.target.value) || 1)} />
          </div>

          <div className="side-actions">
            <button className="btn btn-primary btn-full" onClick={handleAddAccount} disabled={!canAddMore && packageActive}>
              Tek Token Ekle
            </button>
            <button className="btn btn-full" onClick={handleBulkAdd} disabled={!packageActive}>
              Çoklu Token Ekle
            </button>
            <button className="btn btn-full" onClick={refreshAccounts}>
              Toplu Güncelle
            </button>
          </div>

          <div className="activity-list">
            {visibleActivities.map((item) => (
              <div key={item.id} className="activity-item">
                <div className="token-top">
                  <strong>{item.title}</strong>
                  <span className={`badge ${item.tone}`}>{item.tone === "live" ? "Canlı" : item.tone === "warn" ? "Uyarı" : "Tamam"}</span>
                </div>
                <p className="muted" style={{ margin: "10px 0 0" }}>{item.detail}</p>
              </div>
            ))}
            {hiddenActivityCount > 0 ? <p className="subtle">{hiddenActivityCount} eski log gizlendi.</p> : null}
          </div>

          {adminMode ? (
            <div className="guide-card" style={{ marginTop: 16 }}>
              <h3>Admin Paket Atama</h3>
              <div className="input-row" style={{ marginBottom: 10 }}>
                <input className="field" value={sessionDiscordId} onChange={(event) => setSessionDiscordId(event.target.value)} placeholder="Discord ID" />
                <select className="field" value={packageTier} onChange={(event) => setPackageTier(event.target.value as "free" | "classic" | "premium") }>
                  <option value="free">Free</option>
                  <option value="classic">Classic</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div className="input-row" style={{ marginBottom: 10 }}>
                <input className="field" value={loginName} onChange={(event) => setLoginName(event.target.value)} placeholder="Kullanıcı adı" />
                <input className="field" type="number" min={1} value={limit} onChange={(event) => setLimit(Number(event.target.value) || 1)} placeholder="Limit" />
              </div>
              <div className="input-row" style={{ marginBottom: 10 }}>
                <select className="field" value={adminRole} onChange={(event) => setAdminRole(event.target.value as "user" | "admin")}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <button
                className="btn btn-full auth-discord-btn"
                onClick={async () => {
                  const response = await fetch("/api/admin/users/package", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      discordId: sessionDiscordId,
                      userName: loginName,
                      tier: packageTier,
                      customLimit: limit,
                      role: adminRole
                    })
                  });

                  if (!response.ok) {
                    pushActivity("Paket atanamadı", "Discord ID veya paket verisi kontrol edilmeli.", "warn");
                    return;
                  }

                  const sessionResponse = await fetch("/api/auth/session");
                  if (sessionResponse.ok) {
                    const refreshed = await sessionResponse.json();
                    hydrateSession(refreshed);
                  }

                  pushActivity("Paket atandı", `${loginName} için ${packageTierLabel} paketi kaydedildi.`, "live");
                }}
              >
                Paketi Kaydet
              </button>
            </div>
          ) : null}

          <div className="footer-note">
            Token system luhux tarafından geliştirilmiştir. Herhangi bir sorun veya öneri için lütfen iletişime geçin.
          </div>
        </aside>
      </section>
    </main>
  );
}
