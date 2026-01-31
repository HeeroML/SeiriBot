"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import "./webapp.css";

type GroupConfig = {
  chatId: number;
  welcomeMessage: string;
  rulesMessage: string;
  allowlist: number[];
  denylist: number[];
  verifiedUsers: Record<string, number>;
  deleteServiceMessages: boolean;
};

type ManagedGroup = {
  chatId: number;
  title?: string;
  updatedAt: number;
};

type WarningRecord = {
  chatId: number;
  userId: number;
  count: number;
  lastReason?: string;
  updatedAt: number;
  updatedBy?: number;
};

type FederationRecord = {
  fedChatId: number;
  linkedChats: number[];
  bannedUsers: number[];
};

type ApiResult<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
          };
        };
        ready: () => void;
        expand: () => void;
      };
    };
  }
}

function formatIdList(values: number[], limit = 40): string {
  if (!values.length) return "-";
  const slice = values.slice(0, limit).join(", ");
  if (values.length <= limit) return slice;
  return `${slice} ... (+${values.length - limit})`;
}

export default function WebAppPage(): JSX.Element {
  const [initData, setInitData] = useState("");
  const [userLabel, setUserLabel] = useState("nicht verbunden");
  const [status, setStatus] = useState<string>("");
  const [nonce, setNonce] = useState("");
  const [nonceChatId, setNonceChatId] = useState<number | null>(null);
  const [chatIdInput, setChatIdInput] = useState("");
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [chatTitle, setChatTitle] = useState<string | undefined>();
  const [groups, setGroups] = useState<ManagedGroup[]>([]);

  const [config, setConfig] = useState<GroupConfig | null>(null);
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [rulesMessage, setRulesMessage] = useState("");
  const [deleteServiceMessages, setDeleteServiceMessages] = useState(false);
  const [allowInput, setAllowInput] = useState("");
  const [denyInput, setDenyInput] = useState("");

  const [warningUserId, setWarningUserId] = useState("");
  const [warning, setWarning] = useState<WarningRecord | null>(null);
  const [warningReason, setWarningReason] = useState("");

  const [fedChatId, setFedChatId] = useState("");
  const [federation, setFederation] = useState<FederationRecord | null>(null);
  const [fedChatInput, setFedChatInput] = useState("");
  const [fedBanInput, setFedBanInput] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramChatId = params.get("chatId");
    const paramNonce = params.get("nonce");
    if (paramChatId) {
      setChatIdInput(paramChatId);
      const parsed = Number(paramChatId);
      if (Number.isFinite(parsed) && paramNonce) {
        setNonceChatId(parsed);
      }
    }
    if (paramNonce) {
      setNonce(paramNonce);
    }
  }, []);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      setStatus("Telegram WebApp nicht erkannt. Bitte in Telegram oeffnen.");
      return;
    }
    webApp.ready();
    webApp.expand();
    setInitData(webApp.initData || "");
    const user = webApp.initDataUnsafe?.user;
    if (user) {
      const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
      const handle = user.username ? `@${user.username}` : "";
      setUserLabel(`${name || "User"} ${handle}`.trim());
    } else {
      setUserLabel("User");
    }
  }, []);

  const canAct = useMemo(() => Boolean(initData && activeChatId), [initData, activeChatId]);
  const effectiveNonce =
    nonce && activeChatId && nonceChatId === activeChatId ? nonce : undefined;

  async function api<T>(path: string, body: Record<string, unknown>): Promise<ApiResult<T>> {
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = (await response.json().catch(() => ({}))) as ApiResult<T>;
      if (!response.ok) {
        return { ok: false, error: data.error || "Fehler" };
      }
      return data;
    } catch (error) {
      return { ok: false, error: "Netzwerkfehler" };
    }
  }

  async function authForChat(chatId: number, nonceValue?: string): Promise<void> {
    if (!initData) {
      setStatus("initData fehlt. Bitte WebApp in Telegram oeffnen.");
      return;
    }
    setStatus("Pruefe Admin-Rechte...");
    const chosenNonce = nonceValue || nonce || undefined;
    if (chosenNonce) {
      setNonceChatId(chatId);
    }
    const result = await api<{ user: { id: number }; chatId: number; chatTitle?: string }>(
      "/api/webapp/auth",
      {
        initData,
        chatId,
        nonce: chosenNonce
      }
    );
    if (!result.ok) {
      setStatus(result.error || "Admin-Check fehlgeschlagen.");
      return;
    }
    setActiveChatId(result.data?.chatId ?? chatId);
    setChatTitle(result.data?.chatTitle);
    setStatus("Admin bestaetigt.");
    await loadConfig(result.data?.chatId ?? chatId, chosenNonce);
  }

  async function loadGroups(): Promise<void> {
    if (!initData) return;
    setStatus("Lade Gruppen...");
    const result = await api<{ groups: ManagedGroup[] }>("/api/webapp/groups", { initData });
    if (!result.ok) {
      setStatus(result.error || "Konnte Gruppen nicht laden.");
      return;
    }
    setGroups(result.data?.groups ?? []);
    setStatus("Gruppen geladen.");
  }

  async function loadConfig(chatId: number, nonceOverride?: string): Promise<void> {
    const result = await api<{ config: GroupConfig }>("/api/webapp/config/get", {
      initData,
      chatId,
      nonce: nonceOverride ?? effectiveNonce
    });
    if (!result.ok || !result.data?.config) {
      setStatus(result.error || "Konnte Konfiguration nicht laden.");
      return;
    }
    setConfig(result.data.config);
    setWelcomeMessage(result.data.config.welcomeMessage);
    setRulesMessage(result.data.config.rulesMessage);
    setDeleteServiceMessages(result.data.config.deleteServiceMessages);
  }

  async function saveConfig(): Promise<void> {
    if (!activeChatId) return;
    const result = await api<{ config: GroupConfig }>("/api/webapp/config/update", {
      initData,
      chatId: activeChatId,
      nonce: effectiveNonce,
      welcomeMessage,
      rulesMessage,
      deleteServiceMessages
    });
    if (!result.ok) {
      setStatus(result.error || "Konnte Konfiguration nicht speichern.");
      return;
    }
    if (result.data?.config) {
      setConfig(result.data.config);
    }
    setStatus("Konfiguration gespeichert.");
  }

  async function updateAllowlist(action: "add" | "remove"): Promise<void> {
    if (!activeChatId) return;
    const userId = Number(allowInput);
    if (!Number.isFinite(userId)) {
      setStatus("Ungueltige Allowlist-UserId.");
      return;
    }
    const result = await api<{ config: GroupConfig }>("/api/webapp/allowlist", {
      initData,
      chatId: activeChatId,
      nonce: effectiveNonce,
      action,
      userId
    });
    if (!result.ok) {
      setStatus(result.error || "Allowlist Update fehlgeschlagen.");
      return;
    }
    if (result.data?.config) setConfig(result.data.config);
    setStatus("Allowlist aktualisiert.");
  }

  async function updateDenylist(action: "add" | "remove"): Promise<void> {
    if (!activeChatId) return;
    const userId = Number(denyInput);
    if (!Number.isFinite(userId)) {
      setStatus("Ungueltige Denylist-UserId.");
      return;
    }
    const result = await api<{ config: GroupConfig }>("/api/webapp/denylist", {
      initData,
      chatId: activeChatId,
      nonce: effectiveNonce,
      action,
      userId
    });
    if (!result.ok) {
      setStatus(result.error || "Denylist Update fehlgeschlagen.");
      return;
    }
    if (result.data?.config) setConfig(result.data.config);
    setStatus("Denylist aktualisiert.");
  }

  async function clearVerified(): Promise<void> {
    if (!activeChatId) return;
    const result = await api<{ config: GroupConfig }>("/api/webapp/verified", {
      initData,
      chatId: activeChatId,
      nonce: effectiveNonce
    });
    if (!result.ok) {
      setStatus(result.error || "Konnte Cache nicht leeren.");
      return;
    }
    if (result.data?.config) setConfig(result.data.config);
    setStatus("Verifizierungs-Cache geleert.");
  }

  async function fetchWarning(action: "get" | "increment" | "decrement"): Promise<void> {
    if (!activeChatId) return;
    const userId = Number(warningUserId);
    if (!Number.isFinite(userId)) {
      setStatus("Ungueltige Warning-UserId.");
      return;
    }
    const result = await api<{ warning: WarningRecord | null }>("/api/webapp/warnings", {
      initData,
      chatId: activeChatId,
      nonce: effectiveNonce,
      action,
      userId,
      reason: warningReason || undefined
    });
    if (!result.ok) {
      setStatus(result.error || "Warning-Update fehlgeschlagen.");
      return;
    }
    setWarning(result.data?.warning ?? null);
    setStatus("Warning aktualisiert.");
  }

  async function fetchFederation(action: "get" | "addChat" | "removeChat" | "ban" | "unban"): Promise<void> {
    if (!initData) {
      setStatus("initData fehlt. Bitte WebApp in Telegram oeffnen.");
      return;
    }
    const targetChatId = Number(fedChatId);
    if (!Number.isFinite(targetChatId)) {
      setStatus("Ungueltige Federation-ChatId.");
      return;
    }
    const payload: Record<string, unknown> = {
      initData,
      chatId: targetChatId,
      action
    };
    if (action === "addChat" || action === "removeChat") {
      const linkedChatId = Number(fedChatInput);
      if (!Number.isFinite(linkedChatId)) {
        setStatus("Ungueltige Linked-ChatId.");
        return;
      }
      payload.targetChatId = linkedChatId;
    }
    if (action === "ban" || action === "unban") {
      const banUserId = Number(fedBanInput);
      if (!Number.isFinite(banUserId)) {
        setStatus("Ungueltige Ban-UserId.");
        return;
      }
      payload.userId = banUserId;
    }
    const result = await api<{ federation: FederationRecord }>("/api/webapp/federation", payload);
    if (!result.ok) {
      setStatus(result.error || "Federation-Update fehlgeschlagen.");
      return;
    }
    setFederation(result.data?.federation ?? null);
    setStatus("Federation aktualisiert.");
  }

  return (
    <div className="webapp">
      <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      <header className="hero">
        <div>
          <p className="eyebrow">Seiri Bot</p>
          <h1>WebApp Konfiguration</h1>
          <p className="sub">
            Admin-Panel fuer Begruessung, Regeln, Allow/Deny, Warnings und Federation.
          </p>
        </div>
        <div className="status">
          <span className="pill">Status</span>
          <p>{status || "Bereit."}</p>
          <p className="muted">User: {userLabel}</p>
          <p className="muted">initData: {initData ? "OK" : "fehlend"}</p>
        </div>
      </header>

      <section className="panel">
        <h2>Gruppe waehlen</h2>
        <div className="grid">
          <div className="field">
            <label>Chat ID</label>
            <input
              value={chatIdInput}
              onChange={(event) => setChatIdInput(event.target.value)}
              placeholder="z.B. -1001234567890"
            />
            <button
              className="primary"
              onClick={() => {
                const chatId = Number(chatIdInput);
                if (!Number.isFinite(chatId)) {
                  setStatus("Ungueltige Chat ID.");
                  return;
                }
                void authForChat(chatId, nonce || undefined);
              }}
            >
              Admin pruefen
            </button>
          </div>
          <div className="field">
            <label>Nonce (optional)</label>
            <input value={nonce} onChange={(event) => setNonce(event.target.value)} />
            <button className="ghost" onClick={() => void loadGroups()}>
              Meine Gruppen laden
            </button>
          </div>
          <div className="field">
            <label>Verknuepfte Gruppen</label>
            <div className="chip-list">
              {groups.length === 0 ? (
                <span className="muted">Noch keine Gruppen verknuepft.</span>
              ) : (
                groups.map((group) => (
                  <button
                    key={group.chatId}
                    className="chip"
                    onClick={() => void authForChat(group.chatId)}
                  >
                    {group.title ? `${group.title}` : group.chatId}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        {activeChatId ? (
          <p className="muted">
            Aktive Gruppe: {chatTitle || activeChatId} (Chat ID: {activeChatId})
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h2>Konfiguration</h2>
        <div className="grid two">
          <div className="field">
            <label>Willkommensnachricht</label>
            <textarea
              value={welcomeMessage}
              onChange={(event) => setWelcomeMessage(event.target.value)}
              rows={5}
              disabled={!canAct}
            />
          </div>
          <div className="field">
            <label>Regeln</label>
            <textarea
              value={rulesMessage}
              onChange={(event) => setRulesMessage(event.target.value)}
              rows={5}
              disabled={!canAct}
            />
          </div>
        </div>
        <div className="row">
          <label className="toggle">
            <input
              type="checkbox"
              checked={deleteServiceMessages}
              onChange={(event) => setDeleteServiceMessages(event.target.checked)}
              disabled={!canAct}
            />
            Service-Nachrichten loeschen
          </label>
          <button className="primary" onClick={() => void saveConfig()} disabled={!canAct}>
            Speichern
          </button>
        </div>
        <div className="stats">
          <div>
            <strong>Allowlist</strong>
            <span>{config?.allowlist.length ?? 0}</span>
          </div>
          <div>
            <strong>Denylist</strong>
            <span>{config?.denylist.length ?? 0}</span>
          </div>
          <div>
            <strong>Verified Cache</strong>
            <span>{config ? Object.keys(config.verifiedUsers).length : 0}</span>
          </div>
        </div>
        <div className="lists">
          <div>
            <p className="muted">Allowlist: {formatIdList(config?.allowlist ?? [])}</p>
            <p className="muted">Denylist: {formatIdList(config?.denylist ?? [])}</p>
          </div>
          <button className="ghost" onClick={() => void clearVerified()} disabled={!canAct}>
            Cache leeren
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Allow / Deny</h2>
        <div className="grid">
          <div className="field">
            <label>Allowlist User ID</label>
            <input
              value={allowInput}
              onChange={(event) => setAllowInput(event.target.value)}
              placeholder="123456789"
              disabled={!canAct}
            />
            <div className="row">
              <button
                className="primary"
                onClick={() => void updateAllowlist("add")}
                disabled={!canAct}
              >
                Hinzufuegen
              </button>
              <button
                className="ghost"
                onClick={() => void updateAllowlist("remove")}
                disabled={!canAct}
              >
                Entfernen
              </button>
            </div>
          </div>
          <div className="field">
            <label>Denylist User ID</label>
            <input
              value={denyInput}
              onChange={(event) => setDenyInput(event.target.value)}
              placeholder="123456789"
              disabled={!canAct}
            />
            <div className="row">
              <button
                className="danger"
                onClick={() => void updateDenylist("add")}
                disabled={!canAct}
              >
                Hinzufuegen
              </button>
              <button
                className="ghost"
                onClick={() => void updateDenylist("remove")}
                disabled={!canAct}
              >
                Entfernen
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Warnings</h2>
        <div className="grid">
          <div className="field">
            <label>User ID</label>
            <input
              value={warningUserId}
              onChange={(event) => setWarningUserId(event.target.value)}
              placeholder="123456789"
              disabled={!canAct}
            />
          </div>
          <div className="field">
            <label>Grund (optional)</label>
            <input
              value={warningReason}
              onChange={(event) => setWarningReason(event.target.value)}
              placeholder="Spam, etc."
              disabled={!canAct}
            />
          </div>
          <div className="field">
            <label>Aktuell</label>
            <p className="muted">{warning ? `${warning.count} Warnungen` : "keine Daten"}</p>
          </div>
        </div>
        <div className="row">
          <button className="ghost" onClick={() => void fetchWarning("get")} disabled={!canAct}>
            Laden
          </button>
          <button className="primary" onClick={() => void fetchWarning("increment")} disabled={!canAct}>
            +1
          </button>
          <button className="danger" onClick={() => void fetchWarning("decrement")} disabled={!canAct}>
            -1
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>Federation</h2>
        <div className="grid">
          <div className="field">
            <label>Federation Chat ID</label>
            <input
              value={fedChatId}
              onChange={(event) => setFedChatId(event.target.value)}
              placeholder="-1001234567890"
            />
            <button className="ghost" onClick={() => void fetchFederation("get")}>
              Laden
            </button>
          </div>
          <div className="field">
            <label>Linked Chat ID</label>
            <input
              value={fedChatInput}
              onChange={(event) => setFedChatInput(event.target.value)}
              placeholder="-1009876543210"
            />
            <div className="row">
              <button className="primary" onClick={() => void fetchFederation("addChat")}>
                Hinzufuegen
              </button>
              <button className="ghost" onClick={() => void fetchFederation("removeChat")}>
                Entfernen
              </button>
            </div>
          </div>
          <div className="field">
            <label>Ban User ID</label>
            <input
              value={fedBanInput}
              onChange={(event) => setFedBanInput(event.target.value)}
              placeholder="123456789"
            />
            <div className="row">
              <button className="danger" onClick={() => void fetchFederation("ban")}>
                Ban
              </button>
              <button className="ghost" onClick={() => void fetchFederation("unban")}>
                Unban
              </button>
            </div>
          </div>
        </div>
        <div className="lists">
          <div>
            <p className="muted">Linked Chats: {formatIdList(federation?.linkedChats ?? [])}</p>
            <p className="muted">Banned Users: {formatIdList(federation?.bannedUsers ?? [])}</p>
          </div>
        </div>
      </section>
    </div>
  );
}
