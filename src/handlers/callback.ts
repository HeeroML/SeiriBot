import type { Context } from "grammy";

import type { Config } from "../config.ts";
import { KvStore } from "../storage/kv.ts";

const KV_GRACE_SECONDS = 3600;

/**
 * Handle callbacks like `cap:<id>:<choice>`.
 * Returns true if handled.
 */
export async function handleCaptchaCallback(ctx: Context, store: KvStore, config: Config): Promise<boolean> {
  const data = ctx.callbackQuery?.data;
  if (!data || !data.startsWith("cap:")) return false;

  const parts = data.split(":");
  if (parts.length !== 3) {
    await safeAnswer(ctx, "Invalid captcha payload.");
    return true;
  }

  const id = parts[1];
  const choice = Number.parseInt(parts[2], 10);
  if (!Number.isFinite(choice) || choice < 1 || choice > 4) {
    await safeAnswer(ctx, "Invalid choice.");
    return true;
  }

  const pending = await store.getPendingById(id);
  if (!pending) {
    await safeAnswer(ctx, "Captcha expired or already used.");
    await safeEdit(ctx, "⌛ This captcha is no longer valid.");
    return true;
  }

  // Ensure only the requesting user can solve it.
  if (!ctx.from || ctx.from.id !== pending.userId) {
    await safeAnswer(ctx, "This captcha is not for you.", true);
    return true;
  }

  const now = Date.now();
  if (now > pending.expiresAt) {
    // Expired: decline and cleanup.
    await maybeDecline(ctx, pending.chatId, pending.userId);
    await store.deletePending(id);

    await safeEdit(ctx, "⌛ Time limit exceeded. Your join request was declined.");
    await safeAnswer(ctx, "Expired.");
    return true;
  }

  if (pending.mode !== "pattern" || typeof pending.correctRow !== "number") {
    await safeAnswer(ctx, "Wrong captcha mode.");
    return true;
  }

  if (choice === pending.correctRow) {
    // Success
    await ctx.api.approveChatJoinRequest(pending.chatId, pending.userId);
    await store.deletePending(id);

    await safeEdit(ctx, "✅ Verified! Your join request has been approved.");
    await safeAnswer(ctx, "Approved.");
    return true;
  }

  // Wrong
  const nextAttempts = pending.attempts + 1;
  const remaining = Math.max(0, pending.maxAttempts - nextAttempts);

  if (nextAttempts >= pending.maxAttempts) {
    await maybeDecline(ctx, pending.chatId, pending.userId);
    await store.deletePending(id);

    await safeEdit(ctx, "❌ Verification failed. Your join request was declined.");
    await safeAnswer(ctx, "Declined.");
    return true;
  }

  const kvTtlMs = (config.captchaTtlSeconds + KV_GRACE_SECONDS) * 1000;
  await store.bumpAttempts(id, nextAttempts, kvTtlMs);

  await safeAnswer(ctx, `Wrong. ${remaining} attempt(s) left.`);
  return true;
}

async function maybeDecline(ctx: Context, chatId: number | string, userId: number): Promise<void> {
  try {
    await ctx.api.declineChatJoinRequest(chatId, userId);
  } catch {
    // ignore
  }
}

async function safeAnswer(ctx: Context, text: string, alert = false): Promise<void> {
  try {
    await ctx.answerCallbackQuery({ text, show_alert: alert });
  } catch {
    // ignore
  }
}

async function safeEdit(ctx: Context, text: string): Promise<void> {
  try {
    // Remove keyboard by not passing reply_markup.
    await ctx.editMessageText(text);
  } catch {
    // ignore
  }
}
