import { InlineKeyboard, type Bot } from "grammy";
import type { MyContext } from "../types";
import { generateNonce, generatePatternCaptcha } from "../captcha/pattern";
import { buildTestCallbackData } from "./callbacks";

export function registerTestCaptchaHandlers(bot: Bot<MyContext>): void {
  bot.command("test", async (ctx) => {
    if (!ctx.from) return;

    const captcha = generatePatternCaptcha();
    const nonce = generateNonce();
    ctx.session.testCaptcha = {
      correctRow: captcha.brokenRow,
      nonce,
      createdAt: Date.now()
    };

    const keyboard = new InlineKeyboard()
      .text("1", buildTestCallbackData(ctx.from.id, 1, nonce))
      .text("2", buildTestCallbackData(ctx.from.id, 2, nonce))
      .row()
      .text("3", buildTestCallbackData(ctx.from.id, 3, nonce))
      .text("4", buildTestCallbackData(ctx.from.id, 4, nonce));

    const messageText = [
      "Test-Captcha (keine echte Anfrage).",
      "Finde die Reihe (1-4), in der das Muster gebrochen ist:",
      "",
      captcha.text
    ].join("\n");

    if (ctx.chat?.type === "private") {
      await ctx.reply(messageText, { reply_markup: keyboard });
      return;
    }

    try {
      await ctx.api.sendMessage(ctx.from.id, messageText, { reply_markup: keyboard });
      await ctx.reply("Ich habe dir das Test-Captcha per DM geschickt.");
    } catch (error) {
      await ctx.reply(messageText, { reply_markup: keyboard });
    }
  });
}
