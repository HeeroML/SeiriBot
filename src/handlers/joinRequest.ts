import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import type { Env } from "../env";
import { generateNonce, generatePatternCaptcha } from "../captcha/pattern";
import type { MyContext, PendingCaptcha, PendingIndexEntry } from "../types";
import { makePendingKey } from "../types";
import { buildBanCallbackData, buildCaptchaCallbackData } from "./callbacks";

export function registerJoinRequestHandler(
  bot: Bot<MyContext>,
  deps: { env: Env; pendingIndex: Map<string, PendingIndexEntry> }
): void {
  bot.on("chat_join_request", async (ctx) => {
    const request = ctx.update.chat_join_request;
    const { chat, from, user_chat_id: userChatId } = request;

    if (!from) return;

    const chatId = chat.id;
    const userId = from.id;
    const key = makePendingKey(chatId, userId);
    const now = Date.now();

    const captcha = generatePatternCaptcha();
    const nonce = generateNonce();

    const record: PendingCaptcha = {
      chatId,
      userId,
      userChatId,
      correctRow: captcha.brokenRow,
      attempts: 0,
      maxAttempts: deps.env.MAX_ATTEMPTS,
      createdAt: now,
      expiresAt: now + deps.env.CAPTCHA_TTL_MS,
      nonce
    };

    ctx.session.pendingCaptchas[key] = record;
    deps.pendingIndex.set(key, {
      key,
      chatId,
      userId,
      userChatId,
      expiresAt: record.expiresAt,
      sessionKey: userId.toString()
    });

    const keyboard = new InlineKeyboard()
      .text("1", buildCaptchaCallbackData(chatId, userId, 1, nonce))
      .text("2", buildCaptchaCallbackData(chatId, userId, 2, nonce))
      .row()
      .text("3", buildCaptchaCallbackData(chatId, userId, 3, nonce))
      .text("4", buildCaptchaCallbackData(chatId, userId, 4, nonce))
      .row()
      .text("🚫 Not me", buildBanCallbackData(chatId, userId, nonce));

    const minutes = Math.max(1, Math.ceil(deps.env.CAPTCHA_TTL_MS / 60000));
    const title = chat.title ?? "this group";

    const messageText = [
      `👋 Hi ${from.first_name ?? "du"}!`,
      `Du hast eine Beitrittsanfrage gestellt für: ${title}.`,
      "Finde die Reihe (1–4), in der das Muster gebrochen ist:",
      "",
      captcha.text,
      "",
      "Wenn das nicht du warst, tippe den roten Knopf, um weitere Anfragen zu blockieren.",
      `Du hast ${deps.env.MAX_ATTEMPTS} Versuch${
        deps.env.MAX_ATTEMPTS === 1 ? "" : "e"
      }. Läuft in ~${minutes} Minute${minutes === 1 ? "" : "n"} ab.`
    ].join("\n");

    try {
      const message = await ctx.api.sendMessage(userChatId, messageText, {
        reply_markup: keyboard
      });
      ctx.session.pendingCaptchas[key].lastCaptchaMessageId = message.message_id;
    } catch (error) {
      console.error("Failed to DM captcha, declining join request", error);
      try {
        await ctx.api.declineChatJoinRequest(chatId, userId);
      } catch (declineError) {
        console.error("Failed to decline join request", declineError);
      }
      deps.pendingIndex.delete(key);
      delete ctx.session.pendingCaptchas[key];
    }
  });
}
