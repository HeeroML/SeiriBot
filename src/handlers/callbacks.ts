import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, PendingIndexEntry } from "../types";
import { makePendingKey } from "../types";
import type { ConfigStorage } from "../config/store";
import { getGroupConfig, renderTemplate } from "../config/store";

const CALLBACK_PREFIX = "captcha";
const CALLBACK_RE = /^captcha\|(-?\d+)\|(\d+)\|([1-4])\|([a-f0-9]+)$/i;
const BAN_RE = /^captcha-ban\|(-?\d+)\|(\d+)\|([a-f0-9]+)$/i;
const WELCOME_RE = /^welcome\|(-?\d+)\|(\d+)\|(welcome|rules)$/i;
const TEST_RE = /^test\|(\d+)\|([1-4])\|([a-f0-9]+)$/i;

export type CaptchaCallbackData = {
  chatId: number;
  userId: number;
  row: number;
  nonce: string;
};

export function buildCaptchaCallbackData(
  chatId: number,
  userId: number,
  row: number,
  nonce: string
): string {
  return `${CALLBACK_PREFIX}|${chatId}|${userId}|${row}|${nonce}`;
}

export function buildBanCallbackData(chatId: number, userId: number, nonce: string): string {
  return `captcha-ban|${chatId}|${userId}|${nonce}`;
}

export function buildTestCallbackData(userId: number, row: number, nonce: string): string {
  return `test|${userId}|${row}|${nonce}`;
}

export function parseCaptchaCallback(data: string | undefined): CaptchaCallbackData | null {
  if (!data) return null;
  const match = data.match(CALLBACK_RE);
  if (!match) return null;
  const [, chatIdStr, userIdStr, rowStr, nonce] = match;
  return {
    chatId: Number(chatIdStr),
    userId: Number(userIdStr),
    row: Number(rowStr),
    nonce
  };
}

export function registerCallbackHandlers(
  bot: Bot<MyContext>,
  deps: {
    pendingIndex: Map<string, PendingIndexEntry>;
    configStorage: ConfigStorage;
  }
): void {
  bot.callbackQuery(TEST_RE, async (ctx) => {
    const data = ctx.callbackQuery.data ?? "";
    const match = data.match(TEST_RE);
    if (!match) return;

    const [, userIdStr, rowStr, nonce] = match;
    const userId = Number(userIdStr);
    const row = Number(rowStr);

    if (ctx.from?.id !== userId) {
      await ctx.answerCallbackQuery({ text: "Dieser Button ist nicht für dich." });
      return;
    }

    const testCaptcha = ctx.session.testCaptcha;
    if (!testCaptcha || testCaptcha.nonce !== nonce) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits ersetzt." });
      return;
    }

    const correct = row === testCaptcha.correctRow;
    await ctx.answerCallbackQuery({
      text: correct ? "✅ Richtig!" : "❌ Falsch."
    });
  });

  bot.callbackQuery(CALLBACK_RE, async (ctx) => {
    const data = parseCaptchaCallback(ctx.callbackQuery.data);
    if (!data) return;

    const { chatId, userId, row, nonce } = data;

    if (ctx.from?.id !== userId) {
      await ctx.answerCallbackQuery({ text: "Dieser Button ist nicht für dich." });
      return;
    }

    const key = makePendingKey(chatId, userId);
    const pending = ctx.session.pendingCaptchas[key];

    if (!pending || pending.nonce !== nonce) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits verarbeitet." });
      return;
    }

    const now = Date.now();
    if (pending.expiresAt <= now) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits verarbeitet." });
      return;
    }

    if (pending.status === "processing") {
      await ctx.answerCallbackQuery({ text: "Wird bereits verarbeitet." });
      return;
    }

    if (row === pending.correctRow) {
      pending.status = "processing";
      ctx.session.pendingCaptchas[key] = pending;
      await ctx.answerCallbackQuery({ text: "✅ Richtig! Wird freigegeben..." });
      try {
        await ctx.api.approveChatJoinRequest(chatId, userId);
      } catch (error) {
        console.error("Failed to approve join request", error);
      }
      deps.pendingIndex.delete(key);
      delete ctx.session.pendingCaptchas[key];
      await showWelcomeMessage(ctx, chatId, userId, deps.configStorage, "welcome", true);
      return;
    }

    pending.attempts += 1;
    const remaining = pending.maxAttempts - pending.attempts;

    if (remaining <= 0) {
      pending.status = "processing";
      ctx.session.pendingCaptchas[key] = pending;
      await ctx.answerCallbackQuery({ text: "❌ Zu viele Versuche. Wird abgelehnt..." });
      try {
        await ctx.api.declineChatJoinRequest(chatId, userId);
      } catch (error) {
        console.error("Failed to decline join request", error);
      }
      deps.pendingIndex.delete(key);
      delete ctx.session.pendingCaptchas[key];
      await tryEditCaptchaMessage(ctx, "❌ Too many attempts. Your join request was declined.");
      return;
    }

    ctx.session.pendingCaptchas[key] = pending;
    await ctx.answerCallbackQuery({
      text: `Falsche Reihe. Noch ${remaining} Versuch${remaining === 1 ? "" : "e"}.`
    });
  });

  bot.callbackQuery(BAN_RE, async (ctx) => {
    const data = ctx.callbackQuery.data ?? "";
    const match = data.match(BAN_RE);
    if (!match) return;

    const [, chatIdStr, userIdStr, nonce] = match;
    const chatId = Number(chatIdStr);
    const userId = Number(userIdStr);

    if (ctx.from?.id !== userId) {
      await ctx.answerCallbackQuery({ text: "Dieser Button ist nicht für dich." });
      return;
    }

    const key = makePendingKey(chatId, userId);
    const pending = ctx.session.pendingCaptchas[key];

    if (!pending || pending.nonce !== nonce) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits verarbeitet." });
      return;
    }

    const now = Date.now();
    if (pending.expiresAt <= now) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits verarbeitet." });
      return;
    }

    if (pending.status === "processing") {
      await ctx.answerCallbackQuery({ text: "Wird bereits verarbeitet." });
      return;
    }

    pending.status = "processing";
    ctx.session.pendingCaptchas[key] = pending;
    await ctx.answerCallbackQuery({ text: "Anfrage geschlossen." });

    try {
      await ctx.api.declineChatJoinRequest(chatId, userId);
    } catch (error) {
      console.error("Failed to decline join request", error);
    }

    try {
      await ctx.api.banChatMember(chatId, userId);
    } catch (error) {
      console.error("Failed to ban user", error);
    }

    deps.pendingIndex.delete(key);
    delete ctx.session.pendingCaptchas[key];
    await tryEditCaptchaMessage(ctx, "Anfrage geschlossen.");
  });

  bot.callbackQuery(WELCOME_RE, async (ctx) => {
    const data = ctx.callbackQuery.data ?? "";
    const match = data.match(WELCOME_RE);
    if (!match) return;

    const [, chatIdStr, userIdStr, view] = match;
    const chatId = Number(chatIdStr);
    const userId = Number(userIdStr);

    if (ctx.from?.id !== userId) {
      await ctx.answerCallbackQuery({ text: "Dieser Button ist nicht für dich." });
      return;
    }

    await ctx.answerCallbackQuery();
    await showWelcomeMessage(
      ctx,
      chatId,
      userId,
      deps.configStorage,
      view === "rules" ? "rules" : "welcome",
      true
    );
  });
}

async function tryEditCaptchaMessage(ctx: MyContext, text: string): Promise<void> {
  try {
    await ctx.editMessageText(text);
  } catch (error) {
    // Ignore edit failures (message might be gone or already edited)
  }
}

type WelcomeView = "welcome" | "rules";

function buildWelcomeCallbackData(chatId: number, userId: number, view: WelcomeView): string {
  return `welcome|${chatId}|${userId}|${view}`;
}

async function showWelcomeMessage(
  ctx: MyContext,
  chatId: number,
  userId: number,
  configStorage: ConfigStorage,
  view: WelcomeView,
  preferEdit: boolean
): Promise<void> {
  const config = await getGroupConfig(configStorage, chatId);
  const chatTitle = await resolveChatTitle(ctx, chatId);
  const template = view === "rules" ? config.rulesMessage : config.welcomeMessage;
  const text = renderTemplate(template, chatTitle);
  const toggleView: WelcomeView = view === "rules" ? "welcome" : "rules";
  const label = view === "rules" ? "Welcome" : "Rules";
  const keyboard = new InlineKeyboard().text(label, buildWelcomeCallbackData(chatId, userId, toggleView));

  if (preferEdit) {
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
      return;
    } catch (error) {
      // Fall through to send a new message
    }
  }

  try {
    await ctx.api.sendMessage(userId, text, { reply_markup: keyboard });
  } catch (error) {
    console.error("Failed to send welcome message", error);
  }
}

async function resolveChatTitle(ctx: MyContext, chatId: number): Promise<string | undefined> {
  try {
    const chat = await ctx.api.getChat(chatId);
    if ("title" in chat && chat.title) return chat.title;
  } catch (error) {
    console.error("Failed to fetch chat title", error);
  }
  return undefined;
}
