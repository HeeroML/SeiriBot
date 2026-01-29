import type { Bot } from "grammy";
import type { Config } from "../config.ts";
import type { PendingCaptcha } from "../storage/kv.ts";
import { KvStore } from "../storage/kv.ts";

type TurnstileResponse = {
  success: boolean;
  "error-codes"?: string[];
  challenge_ts?: string;
  hostname?: string;
  action?: string;
  cdata?: string;
};

export function startTurnstileServer(bot: Bot, store: KvStore, config: Config): void {
  // Only start if properly configured.
  if (config.mode !== "turnstile") return;
  const siteKey = config.turnstileSiteKey!;
  const secretKey = config.turnstileSecretKey!;
  const port = config.httpPort;

  console.log(`[web] Starting Turnstile server on :${port}`);

  Deno.serve({ port }, async (req, connInfo) => {
    const url = new URL(req.url);

    if (url.pathname === "/healthz") {
      return new Response("ok\n", { status: 200 });
    }

    if (url.pathname === "/captcha" && req.method === "GET") {
      const cid = url.searchParams.get("cid") ?? "";
      return new Response(renderCaptchaPage({ cid, siteKey }), {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    if (url.pathname === "/verify" && req.method === "POST") {
      const remoteIp = getRemoteIp(connInfo);
      let body: { cid?: string; token?: string };

      try {
        body = await req.json();
      } catch {
        return json({ ok: false, error: "Invalid JSON" }, 400);
      }

      const cid = (body.cid ?? "").trim();
      const token = (body.token ?? "").trim();
      if (!cid || !token) {
        return json({ ok: false, error: "Missing cid or token" }, 400);
      }

      const pending = await store.getPendingById(cid);
      if (!pending) {
        return json({ ok: false, error: "Unknown or expired challenge" }, 404);
      }

      const now = Date.now();
      if (now > pending.expiresAt) {
        // Expired: decline and cleanup.
        await safeDecline(bot, pending);
        await store.deletePending(cid);
        return json({ ok: false, error: "Challenge expired" }, 410);
      }

      if (pending.mode !== "turnstile") {
        return json({ ok: false, error: "Wrong mode" }, 400);
      }

      // Cloudflare Turnstile server-side verification
      const verify = await verifyTurnstile(secretKey, token, remoteIp);
      if (!verify.success) {
        return json({ ok: false, error: "Captcha failed", codes: verify["error-codes"] ?? [] }, 403);
      }

      // Approve join request
      try {
        await bot.api.approveChatJoinRequest(pending.chatId, pending.userId);
      } catch (err) {
        return json({ ok: false, error: `Approve failed: ${String(err)}` }, 500);
      }

      // Cleanup
      await store.deletePending(cid);

      // Optional: try to notify user in DM (may fail after the join-request messaging window)
      try {
        await bot.api.sendMessage(pending.userChatId, "✅ Verified! Your join request has been approved.");
      } catch {
        // ignore
      }

      return json({ ok: true });
    }

    return new Response("Not found\n", { status: 404 });
  });
}

function renderCaptchaPage(params: { cid: string; siteKey: string }): string {
  const { cid, siteKey } = params;

  // Keep the HTML tiny and dependency-free.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Telegram Verification</title>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, Helvetica, Arial, sans-serif; margin: 24px; }
    .box { max-width: 420px; margin: 0 auto; }
    .hint { color: #555; margin-top: 10px; }
    .status { margin-top: 14px; padding: 10px; border-radius: 8px; background: #f5f5f5; white-space: pre-wrap; }
  </style>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
  <div class="box">
    <h2>Verification</h2>
    <p>Complete the captcha to allow the bot to approve your join request.</p>

    <div class="cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-callback="onTurnstile"></div>

    <div class="hint">If this page doesn't load, try again from Telegram.</div>
    <div id="status" class="status">Waiting for captcha…</div>
  </div>

  <script>
    const cid = ${JSON.stringify(cid)};
    const statusEl = document.getElementById('status');

    async function onTurnstile(token) {
      statusEl.textContent = 'Validating…';
      try {
        const res = await fetch('/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cid, token })
        });
        const data = await res.json();
        if (data.ok) {
          statusEl.textContent = '✅ Verified! You can close this page and return to Telegram.';
        } else {
          statusEl.textContent = '❌ Failed: ' + (data.error || 'unknown') + (data.codes ? ('\n' + data.codes.join(', ')) : '');
        }
      } catch (e) {
        statusEl.textContent = '❌ Network error: ' + String(e);
      }
    }
  </script>
</body>
</html>`;
}

async function verifyTurnstile(secretKey: string, token: string, remoteIp?: string): Promise<TurnstileResponse> {
  const form = new URLSearchParams();
  form.set("secret", secretKey);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  const resp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });

  if (!resp.ok) {
    return { success: false, "error-codes": [`http_${resp.status}`] };
  }

  return await resp.json() as TurnstileResponse;
}

function getRemoteIp(connInfo: Deno.ServeHandlerInfo): string | undefined {
  // If behind a reverse proxy / Cloudflare, you may want to forward and use those headers.
  // We keep it simple here.
  const addr = connInfo.remoteAddr;
  if (addr && "hostname" in addr) return addr.hostname;
  return undefined;
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function safeDecline(bot: Bot, pending: PendingCaptcha): Promise<void> {
  try {
    await bot.api.declineChatJoinRequest(pending.chatId, pending.userId);
  } catch {
    // ignore
  }
}
