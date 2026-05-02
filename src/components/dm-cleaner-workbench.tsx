"use client";

import { useEffect, useRef, useState } from "react";

type ScanStatus = "idle" | "scanning" | "ready" | "running" | "done" | "error";

type ScanPreviewItem = {
  id: string;
  createdAt: string;
  reason: string;
};

type ActivityLog = {
  id: string;
  tone: "ok" | "warn" | "live";
  text: string;
};

type SessionAccount = {
  id: string;
  tokenLabel: string;
  username: string;
  status: "idle" | "ready" | "live";
};

type ScanApiResponse = {
  ok: boolean;
  message?: string;
  channelId: string | null;
  messageIds: string[];
  found: number;
  deletable: number;
  estimatedSeconds: number;
  previewItems: ScanPreviewItem[];
};

type DeleteApiResponse = {
  ok: boolean;
  message?: string;
  removed: number;
  failed: number;
  total: number;
  failedMessageIds?: string[];
  failedReason?: string;
};

type SelectOption = {
  value: string;
  label: string;
};

function CleanerSelect({
  value,
  options,
  onChange,
  disabled,
  placeholder
}: {
  value: string;
  options: SelectOption[];
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const active = options.find((item) => item.value === value) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const onClickOutside = (event: MouseEvent) => {
      if (!rootRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !rootRef.current.contains(target)) {
        setOpen(false);
      }
    };

    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("mousedown", onClickOutside);
    window.addEventListener("keydown", onEscape);

    return () => {
      window.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  return (
    <div className={`dm-select-shell ${open ? "open" : ""} ${disabled ? "disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="dm-select-trigger"
        onClick={() => {
          if (!disabled) {
            setOpen((current) => !current);
          }
        }}
        disabled={disabled}
      >
        <span>{active?.label ?? placeholder ?? "Secim yap"}</span>
        <i className="dm-select-caret" aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div className="dm-select-menu" role="listbox">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`dm-select-option ${option.value === value ? "active" : ""}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function pushLog(logs: ActivityLog[], tone: ActivityLog["tone"], text: string) {
  return [
    {
      id: `${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      tone,
      text
    },
    ...logs
  ].slice(0, 12);
}

export function DmCleanerWorkbench({ loginName }: { loginName: string }) {
  const [accounts, setAccounts] = useState<SessionAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [messageLimit, setMessageLimit] = useState(300);
  const [batchSize, setBatchSize] = useState(25);
  const [delayMs, setDelayMs] = useState(1400);
  const [filterMode, setFilterMode] = useState<"mine" | "contains" | "date">("mine");
  const [containsText, setContainsText] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [includePinned, setIncludePinned] = useState(false);
  const [includeAttachmentsOnly, setIncludeAttachmentsOnly] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [status, setStatus] = useState<ScanStatus>("idle");
  const [progress, setProgress] = useState(0);
  const [previewItems, setPreviewItems] = useState<ScanPreviewItem[]>([]);
  const [scanSummary, setScanSummary] = useState<{ found: number; deletable: number; estimatedSeconds: number } | null>(null);
  const [scanContext, setScanContext] = useState<{ channelId: string; messageIds: string[] } | null>(null);
  const [logs, setLogs] = useState<ActivityLog[]>([
    {
      id: "initial-log",
      tone: "ok",
      text: "Panel hazir. Once temizleyecegin token hesabini sec, sonra DM taramasi baslat."
    }
  ]);

  const isBusy = status === "scanning" || status === "running";

  const accountOptions: SelectOption[] = accounts.map((account) => ({
    value: account.id,
    label: `${account.username} (${account.tokenLabel}) - ${account.status}`
  }));

  const filterOptions: SelectOption[] = [
    { value: "mine", label: "Sadece benim mesajlarim" },
    { value: "contains", label: "Kelime / ifade icerenler" },
    { value: "date", label: "Tarih araligina gore" }
  ];

  useEffect(() => {
    const loadAccounts = async () => {
      setLoadingAccounts(true);

      try {
        const response = await fetch("/api/accounts", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as
          | { ok?: boolean; accounts?: SessionAccount[]; message?: string }
          | null;

        if (!response.ok || !data?.ok) {
          setLogs((current) =>
            pushLog(current, "warn", data?.message || "Hesap listesi alinamadi. Once panelden token ekle.")
          );
          setAccounts([]);
          return;
        }

        const list = Array.isArray(data.accounts) ? data.accounts : [];
        setAccounts(list);

        const firstReady = list.find((account) => account.status === "ready" || account.status === "live");
        const firstAny = list[0];
        const initialAccountId = firstReady?.id ?? firstAny?.id ?? "";
        setSelectedAccountId(initialAccountId);

        if (list.length === 0) {
          setLogs((current) => pushLog(current, "warn", "DM silmek icin en az bir token hesabi eklemelisin."));
        }
      } catch {
        setLogs((current) => pushLog(current, "warn", "Hesap listesi alinirken baglanti hatasi olustu."));
        setAccounts([]);
      } finally {
        setLoadingAccounts(false);
      }
    };

    loadAccounts();
  }, []);

  const canScan = selectedAccountId.length > 0 && targetUserId.trim().length >= 17 && !isBusy && !loadingAccounts;
  const canDelete =
    status === "ready" &&
    !!scanSummary &&
    !!scanContext &&
    scanSummary.deletable > 0 &&
    !isBusy;

  const handleScan = async () => {
    if (!canScan) {
      setLogs((current) => pushLog(current, "warn", "Hesap secip gecerli bir Discord kullanici ID girmen gerekiyor."));
      return;
    }

    setStatus("scanning");
    setProgress(18);
    setPreviewItems([]);
    setScanSummary(null);
    setScanContext(null);
    setLogs((current) => pushLog(current, "live", "DM gecmisi taraniyor..."));

    try {
      const response = await fetch("/api/dm-cleaner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "scan",
          accountId: selectedAccountId,
          targetUserId: targetUserId.trim(),
          messageLimit,
          batchSize,
          delayMs,
          filterMode,
          containsText,
          startDate,
          endDate,
          includePinned,
          includeAttachmentsOnly
        })
      });

      const data = (await response.json().catch(() => null)) as ScanApiResponse | { ok?: boolean; message?: string } | null;

      if (!response.ok || !data || !data.ok) {
        const message = data && "message" in data ? data.message : "Tarama tamamlanamadi.";
        setStatus("error");
        setProgress(0);
        setLogs((current) => pushLog(current, "warn", message || "Tarama tamamlanamadi."));
        return;
      }

      const scanData = data as ScanApiResponse;
      setPreviewItems(Array.isArray(scanData.previewItems) ? scanData.previewItems : []);
      setScanSummary({
        found: scanData.found,
        deletable: scanData.deletable,
        estimatedSeconds: scanData.estimatedSeconds
      });
      setScanContext(
        scanData.channelId
          ? {
              channelId: scanData.channelId,
              messageIds: Array.isArray(scanData.messageIds) ? scanData.messageIds : []
            }
          : null
      );
      setStatus("ready");
      setProgress(100);
      setLogs((current) =>
        pushLog(current, "ok", `Tarama bitti. ${scanData.found} mesaj bulundu, ${scanData.deletable} tanesi silinebilir.`)
      );
    } catch {
      setStatus("error");
      setProgress(0);
      setLogs((current) => pushLog(current, "warn", "Tarama istegi sirasinda baglanti hatasi olustu."));
    }
  };

  const handleDelete = async () => {
    if (!scanSummary || !scanContext) {
      setLogs((current) => pushLog(current, "warn", "Onizleme tamamlanmadan silme baslatilamaz."));
      return;
    }

    if (!confirmDelete) {
      setLogs((current) => pushLog(current, "warn", "Silme onayi kutusunu isaretlemeden islem baslamaz."));
      return;
    }

    setStatus("running");
    setProgress(20);
    setLogs((current) => pushLog(current, "live", "Silme islemi basladi..."));

    try {
      const response = await fetch("/api/dm-cleaner", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "delete",
          accountId: selectedAccountId,
          channelId: scanContext.channelId,
          messageIds: scanContext.messageIds,
          batchSize,
          delayMs
        })
      });

      const data = (await response.json().catch(() => null)) as DeleteApiResponse | { ok?: boolean; message?: string } | null;

      if (!response.ok || !data || !data.ok) {
        const message = data && "message" in data ? data.message : "Silme islemi basarisiz oldu.";
        setStatus("error");
        setProgress(0);
        setLogs((current) => pushLog(current, "warn", message || "Silme islemi basarisiz oldu."));
        return;
      }

      const deleteData = data as DeleteApiResponse;
      const failedMessageIds = Array.isArray(deleteData.failedMessageIds) ? deleteData.failedMessageIds : [];

      setProgress(100);
      setStatus("done");
      setPreviewItems((current) => current.filter((item) => failedMessageIds.includes(item.id)));
      setScanContext(
        failedMessageIds.length > 0
          ? {
              channelId: scanContext.channelId,
              messageIds: failedMessageIds
            }
          : null
      );
      setScanSummary({
        found: failedMessageIds.length,
        deletable: failedMessageIds.length,
        estimatedSeconds: Math.ceil((failedMessageIds.length / Math.max(1, batchSize)) * (Math.max(300, delayMs) / 1000))
      });
      setLogs((current) =>
        pushLog(
          current,
          deleteData.failed > 0 ? "warn" : "live",
          deleteData.failed > 0
            ? `Silme tamamlandi. Basarili: ${deleteData.removed}, basarisiz: ${deleteData.failed}, toplam: ${deleteData.total}. ${deleteData.failedReason ? `Neden: ${deleteData.failedReason}` : ""}`
            : `Silme tamamlandi. Basarili: ${deleteData.removed}, basarisiz: ${deleteData.failed}, toplam: ${deleteData.total}.`
        )
      );
    } catch {
      setStatus("error");
      setProgress(0);
      setLogs((current) => pushLog(current, "warn", "Silme istegi sirasinda baglanti hatasi olustu."));
    }
  };

  return (
    <section className="dm-workbench">
      <article className="dm-card dm-card-main">
        <div className="dm-card-head">
          <h2>Discrub Tarzi Temizleme Akisi</h2>
          <span className={`badge ${status === "done" ? "live" : status === "error" ? "warn" : "neutral"}`}>
            {status === "idle" && "Hazir"}
            {status === "scanning" && "Taraniyor"}
            {status === "ready" && "Onizleme Hazir"}
            {status === "running" && "Silme Suruyor"}
            {status === "done" && "Tamamlandi"}
            {status === "error" && "Hata"}
          </span>
        </div>

        <div className="dm-mini-stats">
          <div>
            <strong>Operator</strong>
            <span>{loginName}</span>
          </div>
          <div>
            <strong>Mesaj Limiti</strong>
            <span>{messageLimit}</span>
          </div>
          <div>
            <strong>Batch / Delay</strong>
            <span>
              {batchSize} / {delayMs}ms
            </span>
          </div>
        </div>

        <div className="dm-form-grid">
          <label className="field-block dm-field-block">
            <span>Temizleme Hesabi</span>
            <CleanerSelect
              value={selectedAccountId}
              onChange={setSelectedAccountId}
              options={accountOptions}
              placeholder="Hesap yok"
              disabled={isBusy || loadingAccounts || accounts.length === 0}
            />
          </label>

          <label className="field-block dm-field-block">
            <span>Hedef Kullanici ID</span>
            <input
              className="field"
              value={targetUserId}
              onChange={(event) => setTargetUserId(event.target.value.trim())}
              placeholder="Orn: 263521443897278464"
              disabled={isBusy}
            />
          </label>

          <label className="field-block dm-field-block">
            <span>Tarama Limiti</span>
            <input
              className="field"
              type="number"
              min={1}
              max={1000}
              value={messageLimit}
              onChange={(event) => setMessageLimit(Number(event.target.value) || 1)}
              disabled={isBusy}
            />
          </label>

          <label className="field-block dm-field-block">
            <span>Batch Boyutu</span>
            <input
              className="field"
              type="number"
              min={1}
              max={100}
              value={batchSize}
              onChange={(event) => setBatchSize(Number(event.target.value) || 1)}
              disabled={isBusy}
            />
          </label>

          <label className="field-block dm-field-block">
            <span>Islem Gecikmesi (ms)</span>
            <input
              className="field"
              type="number"
              min={700}
              max={10000}
              value={delayMs}
              onChange={(event) => setDelayMs(Number(event.target.value) || 700)}
              disabled={isBusy}
            />
          </label>
        </div>

        <label className="field-block dm-field-block">
          <span>Filtre Modu</span>
          <CleanerSelect
            value={filterMode}
            onChange={(next) => setFilterMode(next as "mine" | "contains" | "date")}
            options={filterOptions}
            disabled={isBusy}
          />
        </label>

        {filterMode === "contains" && (
          <label className="field-block dm-field-block">
            <span>Aranacak Ifade</span>
            <input
              className="field"
              value={containsText}
              onChange={(event) => setContainsText(event.target.value)}
              placeholder="Orn: +rep"
              disabled={isBusy}
            />
          </label>
        )}

        {filterMode === "date" && (
          <div className="dm-form-grid">
            <label className="field-block dm-field-block">
              <span>Baslangic Tarihi</span>
              <input
                className="field"
                type="datetime-local"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
                disabled={isBusy}
              />
            </label>
            <label className="field-block dm-field-block">
              <span>Bitis Tarihi</span>
              <input
                className="field"
                type="datetime-local"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={isBusy}
              />
            </label>
          </div>
        )}

        <div className="dm-check-row">
          <label className="dm-check">
            <input
              type="checkbox"
              checked={includePinned}
              onChange={(event) => setIncludePinned(event.target.checked)}
              disabled={isBusy}
            />
            <span>Pinned mesajlari da dahil et</span>
          </label>
          <label className="dm-check">
            <input
              type="checkbox"
              checked={includeAttachmentsOnly}
              onChange={(event) => setIncludeAttachmentsOnly(event.target.checked)}
              disabled={isBusy}
            />
            <span>Sadece dosya ekli mesajlar</span>
          </label>
          <label className="dm-check dm-check-confirm">
            <input
              type="checkbox"
              checked={confirmDelete}
              onChange={(event) => setConfirmDelete(event.target.checked)}
              disabled={isBusy}
            />
            <span>Silme onayi veriyorum</span>
          </label>
        </div>

        {status !== "idle" && (
          <div className="dm-progress-wrap">
            <div className="dm-progress-track">
              <div className="dm-progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <small className="subtle">Ilerleme: %{progress}</small>
          </div>
        )}

        <div className="dm-action-row">
          <button className="btn btn-primary" onClick={handleScan} disabled={!canScan}>
            Onizleme Tara
          </button>
          <button className="btn btn-danger" onClick={handleDelete} disabled={!canDelete}>
            Secili Mesajlari Sil
          </button>
        </div>
        {!confirmDelete && status === "ready" && (
          <p className="subtle dm-note">Silme onayi kutusunu isaretleyince silme islemi baslar.</p>
        )}
      </article>

      <section className="dm-grid dm-grid-lower">
        <article className="dm-card dm-card-main">
          <div className="dm-card-head">
            <h2>Onizleme Sonucu</h2>
            <span className="badge neutral">Canli Sonuc</span>
          </div>

          {scanSummary ? (
            <div className="dm-summary-grid">
              <div>
                <strong>{scanSummary.found}</strong>
                <span>Aday Mesaj</span>
              </div>
              <div>
                <strong>{scanSummary.deletable}</strong>
                <span>Silinebilir Mesaj</span>
              </div>
              <div>
                <strong>{scanSummary.estimatedSeconds}s</strong>
                <span>Tahmini Sure</span>
              </div>
            </div>
          ) : (
            <p className="subtle dm-note">Henuz tarama yapilmadi.</p>
          )}

          <div className="dm-preview-list">
            {previewItems.length === 0 && <p className="subtle">Onizleme satiri yok.</p>}
            {previewItems.map((item) => (
              <div key={item.id} className="dm-preview-item">
                <strong>{item.id}</strong>
                <span>{item.createdAt}</span>
                <small>{item.reason}</small>
              </div>
            ))}
          </div>
        </article>

        <aside className="dm-card dm-card-side">
          <h3>Calisma Notlari</h3>
          <p>
            Kesinlike Discord ile bağlantısı bulunmaz,
            Tokenleriniz sadece tarama ve silme islemleri icin backend'e gonderilir, hicbir zaman 3. parti bir servise veya dis ortama aktarilmaz.
          </p>

          <div className="dm-separator" />

          <h3>Islem Logu</h3>
          <div className="dm-log-list">
            {logs.map((log) => (
              <div key={log.id} className={`dm-log dm-log-${log.tone}`}>
                {log.text}
              </div>
            ))}
          </div>

          <div className="dm-separator" />
        </aside>
      </section>
    </section>
  );
}
