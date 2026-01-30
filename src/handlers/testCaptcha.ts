import { type Bot } from "grammy";
import type { MyContext } from "../types";
import { generateNonce, generatePatternCaptcha } from "../captcha/pattern";
import { buildChoiceKeyboard } from "../captcha/render";
import { buildTestBanCallbackData, buildTestCallbackData, buildTestTextModeCallbackData } from "./callbacks";

export function registerTestCaptchaHandlers(bot: Bot<MyContext>): void {
  bot.command("test", async (ctx) => {
    if (!ctx.from) return;

    const userId = ctx.from.id;

    const captcha = generatePatternCaptcha();
    const nonce = generateNonce();
    ctx.session.testCaptcha = {
      question: captcha.question,
      options: captcha.options,
      correctOption: captcha.correctIndex,
      nonce,
      createdAt: Date.now()
    };

    const keyboard = buildChoiceKeyboard(
      captcha.options,
      (index) => buildTestCallbackData(userId, index, nonce),
      {
        textMode: {
          label: "🔎 Textmodus",
          callbackData: buildTestTextModeCallbackData(userId, nonce)
        },
        ban: {
          label: "Nicht hier drücken",
          callbackData: buildTestBanCallbackData(userId, nonce)
        }
      }
    );

    const messageText = [
      "Test-Captcha (keine echte Anfrage).",
      captcha.question,
      "Wähle die richtige Antwort (A-D).",
      "Fuer Textmodus tippe auf \"Textmodus\"."
    ].join("\n");

    if (ctx.chat?.type === "private") {
      await ctx.reply(messageText, { reply_markup: keyboard });
      return;
    }

    try {
      await ctx.api.sendMessage(userId, messageText, { reply_markup: keyboard });
      await ctx.reply("Ich habe dir das Test-Captcha per DM geschickt.");
    } catch (error) {
      await ctx.reply(messageText, { reply_markup: keyboard });
    }
  });
}
