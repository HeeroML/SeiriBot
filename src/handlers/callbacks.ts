import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext, PendingCaptcha } from "../types";
import { makePendingKey } from "../types";
import { buildNumericKeyboard, formatOptionsText } from "../captcha/render";
import type { ConfigStorage } from "../config/store";
import { getGroupConfig, recordVerifiedUser, renderTemplate } from "../config/store";
import type { PendingIndexStore } from "../storage/types";

const CALLBACK_PREFIX = "captcha";
const CALLBACK_RE = /^captcha\|(-?\d+)\|(\d+)\|([1-4])\|([a-f0-9]+)$/i;
const TEXT_RE = /^captcha-text\|(-?\d+)\|(\d+)\|([a-f0-9]+)$/i;
const BAN_RE = /^captcha-ban\|(-?\d+)\|(\d+)\|([a-f0-9]+)$/i;
const WELCOME_RE = /^welcome\|(-?\d+)\|(\d+)\|(welcome|rules)$/i;
const TEST_RE = /^test\|(\d+)\|([1-4])\|([a-f0-9]+)$/i;
const TEST_TEXT_RE = /^test-text\|(\d+)\|([a-f0-9]+)$/i;
const TEST_BAN_RE = /^test-ban\|(\d+)\|([a-f0-9]+)$/i;

const COOLDOWN_MS = 4000;

export type CaptchaCallbackData = {
  chatId: number;
  userId: number;
  choice: number;
  nonce: string;
};

export function buildCaptchaCallbackData(
  chatId: number,
  userId: number,
  choice: number,
  nonce: string
): string {
  return `${CALLBACK_PREFIX}|${chatId}|${userId}|${choice}|${nonce}`;
}

export function buildBanCallbackData(chatId: number, userId: number, nonce: string): string {
  return `captcha-ban|${chatId}|${userId}|${nonce}`;
}

export function buildTextModeCallbackData(chatId: number, userId: number, nonce: string): string {
  return `captcha-text|${chatId}|${userId}|${nonce}`;
}

export function buildTestCallbackData(userId: number, choice: number, nonce: string): string {
  return `test|${userId}|${choice}|${nonce}`;
}

export function buildTestTextModeCallbackData(userId: number, nonce: string): string {
  return `test-text|${userId}|${nonce}`;
}

export function buildTestBanCallbackData(userId: number, nonce: string): string {
  return `test-ban|${userId}|${nonce}`;
}

export function parseCaptchaCallback(data: string | undefined): CaptchaCallbackData | null {
  if (!data) return null;
  const match = data.match(CALLBACK_RE);
  if (!match) return null;
  const [, chatIdStr, userIdStr, choiceStr, nonce] = match;
  return {
    chatId: Number(chatIdStr),
    userId: Number(userIdStr),
    choice: Number(choiceStr),
    nonce
  };
}

function parseChoiceFromText(text: string): number | null {
  const trimmed = text.trim().toUpperCase();
  if (!trimmed) return null;
  const firstChar = trimmed[0];
  if (["1", "2", "3", "4"].includes(firstChar)) {
    return Number(firstChar);
  }
  if (["A", "B", "C", "D"].includes(firstChar)) {
    return firstChar.charCodeAt(0) - 64;
  }
  return null;
}

function getCooldownSeconds(pending: PendingCaptcha, now: number): number {
  if (!pending.cooldownUntil || pending.cooldownUntil <= now) return 0;
  return Math.ceil((pending.cooldownUntil - now) / 1000);
}

function applyCooldown(pending: PendingCaptcha, now: number): number {
  pending.cooldownUntil = now + COOLDOWN_MS;
  return Math.ceil(COOLDOWN_MS / 1000);
}

export function registerCallbackHandlers(
  bot: Bot<MyContext>,
  deps: {
    pendingIndex: PendingIndexStore;
    configStorage: ConfigStorage;
  }
): void {
  bot.callbackQuery(TEST_RE, async (ctx) => {
    const data = ctx.callbackQuery.data ?? "";
    const match = data.match(TEST_RE);
    if (!match) return;

    const [, userIdStr, choiceStr, nonce] = match;
    const userId = Number(userIdStr);
    const choice = Number(choiceStr);

    if (ctx.from?.id !== userId) {
      await ctx.answerCallbackQuery({ text: "Dieser Button ist nicht für dich." });
      return;
    }

    const testCaptcha = ctx.session.testCaptcha;
    if (!testCaptcha || testCaptcha.nonce !== nonce) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits ersetzt." });
      return;
    }

    const correct = choice === testCaptcha.correctOption;
    await ctx.answerCallbackQuery({
      text: correct ? "✅ Richtig!" : "❌ Falsch."
    });
  });

  bot.callbackQuery(TEST_TEXT_RE, async (ctx) => {
    const data = ctx.callbackQuery.data ?? "";
    const match = data.match(TEST_TEXT_RE);
    if (!match) return;

    const [, userIdStr, nonce] = match;
    const userId = Number(userIdStr);

    if (ctx.from?.id !== userId) {
      await ctx.answerCallbackQuery({ text: "Dieser Button ist nicht für dich." });
      return;
    }

    const testCaptcha = ctx.session.testCaptcha;
    if (!testCaptcha || testCaptcha.nonce !== nonce) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits ersetzt." });
      return;
    }

    if (testCaptcha.textMode) {
      await ctx.answerCallbackQuery({ text: "Textmodus ist bereits aktiv." });
      return;
    }

    const messageText = [
      "Textmodus aktiviert. Antworte mit 1-4.",
      testCaptcha.question,
      "",
      formatOptionsText(testCaptcha.options)
    ].join("\n");

    const keyboard = buildNumericKeyboard(
      testCaptcha.options.length,
      (index) => buildTestCallbackData(userId, index, nonce),
      {
        ban: {
          label: "Nicht hier drücken",
          callbackData: buildTestBanCallbackData(userId, nonce)
        }
      }
    );

    try {
      await ctx.editMessageText(messageText, { reply_markup: keyboard });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: "Textmodus konnte nicht angezeigt werden." });
      return;
    }

    testCaptcha.textMode = true;
    ctx.session.testCaptcha = testCaptcha;
    await ctx.answerCallbackQuery({ text: "Textmodus aktiviert." });
  });

  bot.callbackQuery(TEST_BAN_RE, async (ctx) => {
    const data = ctx.callbackQuery.data ?? "";
    const match = data.match(TEST_BAN_RE);
    if (!match) return;

    const [, userIdStr, nonce] = match;
    const userId = Number(userIdStr);

    if (ctx.from?.id !== userId) {
      await ctx.answerCallbackQuery({ text: "Dieser Button ist nicht für dich." });
      return;
    }

    const testCaptcha = ctx.session.testCaptcha;
    if (!testCaptcha || testCaptcha.nonce !== nonce) {
      await ctx.answerCallbackQuery({ text: "Abgelaufen oder bereits ersetzt." });
      return;
    }

    await ctx.answerCallbackQuery({ text: "Das war der falsche Button." });
  });

  bot.callbackQuery(CALLBACK_RE, async (ctx) => {
    const data = parseCaptchaCallback(ctx.callbackQuery.data);
    if (!data) return;

    const { chatId, userId, choice, nonce } = data;

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

    const cooldownSeconds = getCooldownSeconds(pending, now);
    if (cooldownSeconds > 0) {
      await ctx.answerCallbackQuery({ text: `Bitte warte ${cooldownSeconds} Sek.` });
      return;
    }

    if (choice === pending.correctOption) {
      pending.status = "processing";
      ctx.session.pendingCaptchas[key] = pending;
      await ctx.answerCallbackQuery({ text: "✅ Richtig! Wird freigegeben..." });
      let approved = false;
      try {
        await ctx.api.approveChatJoinRequest(chatId, userId);
        approved = true;
      } catch (error) {
        console.error("Failed to approve join request", error);
      }
      if (approved) {
        await recordVerifiedUser(deps.configStorage, chatId, userId, Date.now());
      }
      await safeDeletePending(deps.pendingIndex, key);
      delete ctx.session.pendingCaptchas[key];
      await deleteCaptchaMessage(ctx, pending);
      await showWelcomeMessage(ctx, chatId, userId, deps.configStorage, "welcome", false);
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
      await safeDeletePending(deps.pendingIndex, key);
      delete ctx.session.pendingCaptchas[key];
      await tryEditCaptchaMessage(ctx, "❌ Zu viele Versuche. Deine Anfrage wurde abgelehnt.");
      return;
    }

    const waitSeconds = applyCooldown(pending, now);
    ctx.session.pendingCaptchas[key] = pending;
    await ctx.answerCallbackQuery({
      text: `❌ Falsch. Noch ${remaining} Versuch${remaining === 1 ? "" : "e"}. Warte ${waitSeconds} Sek.`
    });
  });

  bot.callbackQuery(TEXT_RE, async (ctx) => {
    const data = ctx.callbackQuery.data ?? "";
    const match = data.match(TEXT_RE);
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

    if (pending.textMode) {
      await ctx.answerCallbackQuery({ text: "Textmodus ist bereits aktiv." });
      return;
    }

    const remaining = pending.maxAttempts - pending.attempts;
    const messageText = [
      "Textmodus aktiviert. Antworte mit 1-4.",
      pending.question,
      "",
      formatOptionsText(pending.options),
      "",
      `Du hast noch ${remaining} Versuch${remaining === 1 ? "" : "e"}.`
    ].join("\n");

    const keyboard = buildNumericKeyboard(
      pending.options.length,
      (index) => buildCaptchaCallbackData(chatId, userId, index, nonce),
      {
        ban: {
          label: "Nicht hier drücken",
          callbackData: buildBanCallbackData(chatId, userId, nonce)
        }
      }
    );

    try {
      await ctx.editMessageText(messageText, { reply_markup: keyboard });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: "Textmodus konnte nicht angezeigt werden." });
      return;
    }

    pending.textMode = true;
    if (ctx.callbackQuery.message?.message_id) {
      pending.lastCaptchaMessageId = ctx.callbackQuery.message.message_id;
    }
    ctx.session.pendingCaptchas[key] = pending;
    await ctx.answerCallbackQuery({ text: "Textmodus aktiviert." });
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
    await ctx.answerCallbackQuery({ text: "Alles klar." });

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

    await safeDeletePending(deps.pendingIndex, key);
    delete ctx.session.pendingCaptchas[key];
    await tryEditCaptchaMessage(ctx, "Anfrage gespeichert.");
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.chat?.type !== "private") return next();
    const text = ctx.message.text ?? "";
    if (text.trim().startsWith("/")) return next();

    const choice = parseChoiceFromText(text);
    if (!choice) return next();

    const now = Date.now();
    const pendingEntries = Object.entries(ctx.session.pendingCaptchas).filter(
      ([, pending]) => pending && pending.textMode && pending.status !== "processing"
    );

    if (pendingEntries.length > 0) {
      const [key, pending] = pendingEntries.sort(
        ([, left], [, right]) => right.createdAt - left.createdAt
      )[0];

      if (pending.expiresAt <= now) {
        await safeDeletePending(deps.pendingIndex, key);
        delete ctx.session.pendingCaptchas[key];
        await ctx.reply("Abgelaufen oder bereits verarbeitet.");
        return;
      }

      const cooldownSeconds = getCooldownSeconds(pending, now);
      if (cooldownSeconds > 0) {
        await ctx.reply(`Bitte warte ${cooldownSeconds} Sek.`);
        return;
      }

      if (choice === pending.correctOption) {
        pending.status = "processing";
        ctx.session.pendingCaptchas[key] = pending;
        await ctx.reply("✅ Richtig! Wird freigegeben...");
        let approved = false;
        try {
          await ctx.api.approveChatJoinRequest(pending.chatId, pending.userId);
          approved = true;
        } catch (error) {
          console.error("Failed to approve join request", error);
        }
        if (approved) {
          await recordVerifiedUser(deps.configStorage, pending.chatId, pending.userId, Date.now());
        }
        await safeDeletePending(deps.pendingIndex, key);
        delete ctx.session.pendingCaptchas[key];
        await deleteCaptchaMessage(ctx, pending);
        await showWelcomeMessage(ctx, pending.chatId, pending.userId, deps.configStorage, "welcome", false);
        return;
      }

      pending.attempts += 1;
      const remaining = pending.maxAttempts - pending.attempts;

      if (remaining <= 0) {
        pending.status = "processing";
        ctx.session.pendingCaptchas[key] = pending;
        await ctx.reply("❌ Zu viele Versuche. Wird abgelehnt...");
        try {
          await ctx.api.declineChatJoinRequest(pending.chatId, pending.userId);
        } catch (error) {
          console.error("Failed to decline join request", error);
        }
        await safeDeletePending(deps.pendingIndex, key);
        delete ctx.session.pendingCaptchas[key];
        await ctx.reply("Deine Anfrage wurde abgelehnt.");
        return;
      }

      const waitSeconds = applyCooldown(pending, now);
      ctx.session.pendingCaptchas[key] = pending;
      await ctx.reply(
        `❌ Falsch. Noch ${remaining} Versuch${remaining === 1 ? "" : "e"}. Warte ${waitSeconds} Sek.`
      );
      return;
    }

    const testCaptcha = ctx.session.testCaptcha;
    if (testCaptcha?.textMode) {
      const correct = choice === testCaptcha.correctOption;
      await ctx.reply(correct ? "✅ Richtig!" : "❌ Falsch.");
      return;
    }

    return next();
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

async function safeDeletePending(pendingIndex: PendingIndexStore, key: string): Promise<void> {
  try {
    await pendingIndex.delete(key);
  } catch (error) {
    console.error("Failed to delete pending index", error);
  }
}

async function deleteCaptchaMessage(ctx: MyContext, pending: PendingCaptcha): Promise<void> {
  const messageId = pending.lastCaptchaMessageId ?? ctx.callbackQuery?.message?.message_id;
  if (!messageId) return;
  try {
    await ctx.api.deleteMessage(pending.userChatId, messageId);
  } catch (error) {
    // Ignore delete failures (message might be gone or cannot be deleted)
  }
}

type WelcomeView = "welcome" | "rules";

function buildWelcomeCallbackData(chatId: number, userId: number, view: WelcomeView): string {
  return `welcome|${chatId}|${userId}|${view}`;
}

export async function showWelcomeMessage(
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
