import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";

import type { Config } from "../config.ts";
import { createPatternChallenge } from "../captcha/pattern.ts";
import type { PendingCaptcha } from "../storage/kv.ts";
import { KvStore } from "../storage/kv.ts";
import { randomId } from "../util/random.ts";

const KV_GRACE_SECONDS = 3600; // keep records around a bit longer than business TTL

export async function handleJoinRequest(ctx: Context, store: KvStore, config: Config): Promise<void> {
  const jr = ctx.update.chat_join_request;
  if (!jr) return;

  // Optional allowlist
  if (config.allowedChats.size > 0 && !config.allowedChats.has(String(jr.chat.id))) {
    // Ignore join requests for other chats.
    return;
  }

  const chatId = jr.chat.id;
  const userId = jr.from.id;
  const userChatId = jr.user_chat_id;

  // Remove any previous pending captcha for the same user+chat.
  const existing = await store.getPendingIdForUser(chatId, userId);
  if (existing) {
    try {
      await store.deletePending(existing);
    } catch {
      // ignore
    }
  }

  const now = Date.now();
  const expiresAt = now + config.captchaTtlSeconds * 1000;
  const kvTtlMs = (config.captchaTtlSeconds + KV_GRACE_SECONDS) * 1000;

  const pendingBase = {
    mode: config.mode,
    chatId,
    userId,
    userChatId,
    createdAt: now,
    expiresAt,
    attempts: 0,
    maxAttempts: config.captchaMaxAttempts,
  } as const;

  try {
    if (config.mode === "pattern") {
      const challenge = createPatternChallenge();
      const pending: PendingCaptcha = {
        ...pendingBase,
        id: challenge.id,
        mode: "pattern",
        correctRow: challenge.correctRow,
      };

      await store.putPending(pending, kvTtlMs);

      const kb = new InlineKeyboard()
        .text("1", `cap:${challenge.id}:1`)
        .text("2", `cap:${challenge.id}:2`)
        .row()
        .text("3", `cap:${challenge.id}:3`)
        .text("4", `cap:${challenge.id}:4`);

      const ttlMin = Math.ceil(config.captchaTtlSeconds / 60);
      await ctx.api.sendMessage(
        userChatId,
        `${challenge.message}\n\n⏳ Time limit: ${ttlMin} min — Attempts: ${config.captchaMaxAttempts}`,
        {
          parse_mode: "Markdown",
          reply_markup: kb,
        },
      );

      await maybeLog(ctx, config, `🧩 Sent pattern captcha to user ${userId} for chat ${chatId}`);
    } else {
      // Turnstile web captcha.
      const id = randomId(16);
      const pending: PendingCaptcha = {
        ...pendingBase,
        id,
        mode: "turnstile",
      };

      await store.putPending(pending, kvTtlMs);

      const url = `${config.publicBaseUrl!}/captcha?cid=${encodeURIComponent(id)}`;
      const kb = new InlineKeyboard()
        .webApp("Open verification", url)
        .row()
        .url("(If WebApp fails) Open in browser", url);

      const ttlMin = Math.ceil(config.captchaTtlSeconds / 60);
      await ctx.api.sendMessage(
        userChatId,
        [
          "🔐 **Verification required**",
          "Open the captcha and complete it.",
          `⏳ Time limit: ${ttlMin} min`,
        ].join("\n"),
        { parse_mode: "Markdown", reply_markup: kb },
      );

      await maybeLog(ctx, config, `🔐 Sent Turnstile link to user ${userId} for chat ${chatId}`);
    }
  } catch (err) {
    // If we cannot message the user, we may choose to decline (optional policy).
    await maybeLog(ctx, config, `⚠️ Failed to send captcha to user ${userId} for chat ${chatId}: ${String(err)}`);

    try {
      await ctx.api.declineChatJoinRequest(chatId, userId);
      await maybeLog(ctx, config, `🚫 Declined join request for user ${userId} in chat ${chatId} because captcha could not be delivered.`);
    } catch (err2) {
      await maybeLog(ctx, config, `❌ Could not decline join request for user ${userId} in chat ${chatId}: ${String(err2)}`);
    }
  }
}

async function maybeLog(ctx: Context, config: Config, text: string): Promise<void> {
  if (!config.logChatId) return;
  try {
    await ctx.api.sendMessage(config.logChatId, text);
  } catch {
    // ignore
  }
}
