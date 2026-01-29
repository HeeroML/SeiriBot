import type { Bot, Context } from "grammy";
import type { MyContext } from "../types";
import type { ConfigStorage } from "../config/store";
import { getGroupConfig, renderTemplate, setGroupConfig } from "../config/store";

const ADMIN_STATUSES = new Set(["administrator", "creator"]);

export function registerConfigHandlers(
  bot: Bot<MyContext>,
  configStorage: ConfigStorage
): void {
  bot.command("setwelcome", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const payload = extractCommandPayload(ctx);
    if (!payload) {
      await ctx.reply("Nutzung: /setwelcome <Nachricht>");
      return;
    }
    const updated = await setGroupConfig(configStorage, ctx.chat.id, {
      welcomeMessage: payload
    });
    await ctx.reply(
      `✅ Willkommensnachricht aktualisiert:\n\n${renderTemplate(
        updated.welcomeMessage,
        ctx.chat.title
      )}`
    );
  });

  bot.command("setrules", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const payload = extractCommandPayload(ctx);
    if (!payload) {
      await ctx.reply("Nutzung: /setrules <Nachricht>");
      return;
    }
    const updated = await setGroupConfig(configStorage, ctx.chat.id, {
      rulesMessage: payload
    });
    await ctx.reply(
      `✅ Regeln aktualisiert:\n\n${renderTemplate(updated.rulesMessage, ctx.chat.title)}`
    );
  });

  bot.command("showwelcome", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const config = await getGroupConfig(configStorage, ctx.chat.id);
    await ctx.reply(renderTemplate(config.welcomeMessage, ctx.chat.title));
  });

  bot.command("showrules", async (ctx) => {
    if (!(await ensureAdmin(ctx))) return;
    const config = await getGroupConfig(configStorage, ctx.chat.id);
    await ctx.reply(renderTemplate(config.rulesMessage, ctx.chat.title));
  });
}

function extractCommandPayload(ctx: Context): string {
  const text = ctx.message?.text ?? "";
  const entity = ctx.message?.entities?.find(
    (item) => item.type === "bot_command" && item.offset === 0
  );
  if (!entity) return "";
  return text.slice(entity.length).trim();
}

async function ensureAdmin(ctx: Context): Promise<boolean> {
  if (!ctx.chat || (ctx.chat.type !== "group" && ctx.chat.type !== "supergroup")) {
    await ctx.reply("Bitte nutze diesen Befehl in einer Gruppe oder Supergruppe.");
    return false;
  }
  if (!ctx.from) return false;
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    if (ADMIN_STATUSES.has(member.status)) return true;
  } catch (error) {
    console.error("Failed to check admin status", error);
  }
  await ctx.reply("Nur Admins.");
  return false;
}
