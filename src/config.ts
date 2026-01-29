export type Mode = "pattern" | "turnstile";

export type ChatId = number | string;

export interface Config {
  botToken: string;
  mode: Mode;

  // Captcha behavior
  captchaTtlSeconds: number; // business TTL (when we auto-decline)
  captchaMaxAttempts: number;

  // Optional allowlist of chat IDs (comma-separated in env)
  allowedChats: Set<string>; // compare by String(chat.id)

  // Optional moderation log chat
  logChatId?: ChatId;

  // Turnstile mode
  publicBaseUrl?: string; // e.g. https://example.com
  httpPort: number;
  turnstileSiteKey?: string;
  turnstileSecretKey?: string;
}

function mustGetEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getIntEnv(name: string, fallback: number): number {
  const v = Deno.env.get(name);
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`Invalid ${name}: ${v}`);
  return n;
}

export function loadConfig(): Config {
  const botToken = mustGetEnv("BOT_TOKEN");

  const modeEnv = (Deno.env.get("MODE") ?? "pattern").toLowerCase();
  const mode: Mode = modeEnv === "turnstile" ? "turnstile" : "pattern";

  const captchaTtlSeconds = getIntEnv("CAPTCHA_TTL_SECONDS", 600);
  const captchaMaxAttempts = getIntEnv("CAPTCHA_MAX_ATTEMPTS", 3);

  const allowedChatsRaw = (Deno.env.get("ALLOWED_CHATS") ?? "").trim();
  const allowedChats = new Set<string>();
  if (allowedChatsRaw.length > 0) {
    for (const part of allowedChatsRaw.split(",")) {
      const id = part.trim();
      if (id) allowedChats.add(id);
    }
  }

  const logChatIdRaw = (Deno.env.get("LOG_CHAT_ID") ?? "").trim();
  const logChatId = logChatIdRaw ? (Number.isFinite(Number(logChatIdRaw)) ? Number(logChatIdRaw) : logChatIdRaw) : undefined;

  const httpPort = getIntEnv("HTTP_PORT", 8080);

  const publicBaseUrl = (Deno.env.get("PUBLIC_BASE_URL") ?? "").trim() || undefined;
  const turnstileSiteKey = (Deno.env.get("TURNSTILE_SITE_KEY") ?? "").trim() || undefined;
  const turnstileSecretKey = (Deno.env.get("TURNSTILE_SECRET_KEY") ?? "").trim() || undefined;

  if (mode === "turnstile") {
    if (!publicBaseUrl) throw new Error("MODE=turnstile requires PUBLIC_BASE_URL");
    if (!turnstileSiteKey) throw new Error("MODE=turnstile requires TURNSTILE_SITE_KEY");
    if (!turnstileSecretKey) throw new Error("MODE=turnstile requires TURNSTILE_SECRET_KEY");
  }

  return {
    botToken,
    mode,
    captchaTtlSeconds,
    captchaMaxAttempts,
    allowedChats,
    logChatId,
    publicBaseUrl,
    httpPort,
    turnstileSiteKey,
    turnstileSecretKey,
  };
}
