import type { Bot, Context } from "grammy";
import type { MyContext } from "../types";
import type { ConfigStorage } from "../config/store";
import { getGroupConfig, renderTemplate, setGroupConfig } from "../config/store";

const ADMIN_STATUSES = new Set(["administrator", "creator"]);
const CONFIG_CHAT_TYPES = new Set(["group", "supergroup", "channel"]);

export function registerConfigHandlers(
  bot: Bot<MyContext>,
  configStorage: ConfigStorage
): void {
  bot.command("config", async (ctx) => {
    const payload = extractCommandPayload(ctx);

    if (ctx.chat?.type === "private") {
      let targetChatId: number | undefined = ctx.session.activeConfigChatId;
      if (payload) {
        targetChatId = await resolveChatIdFromInput(ctx, payload);
        if (!targetChatId) {
          await ctx.reply("Nutzung: /config <chat-id oder @username>");
          return;
        }
      }

      if (!targetChatId) {
        await ctx.reply("Bitte nutze /config <chat-id> oder /config in der Gruppe.");
        return;
      }

      const adminInfo = await ensureAdminForChat(ctx, targetChatId);
      if (!adminInfo) return;

      ctx.session.activeConfigChatId = targetChatId;
      const config = await getGroupConfig(configStorage, targetChatId);
      await ctx.reply(
        formatConfigMessage(config, adminInfo.chatTitle, targetChatId, true)
      );
      return;
    }

    if (ctx.chat && CONFIG_CHAT_TYPES.has(ctx.chat.type)) {
      const adminInfo = await ensureAdminForChat(ctx, ctx.chat.id);
      if (!adminInfo) return;
      ctx.session.activeConfigChatId = ctx.chat.id;
      const config = await getGroupConfig(configStorage, ctx.chat.id);
      await ctx.reply(
        formatConfigMessage(config, ctx.chat.title ?? adminInfo.chatTitle, ctx.chat.id, false)
      );
      return;
    }

    await ctx.reply("Bitte nutze diesen Befehl in einer Gruppe oder im Privat-Chat.");
  });

  bot.command("setwelcome", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const payload = extractCommandPayload(ctx);
    if (!payload) {
      await ctx.reply("Nutzung: /setwelcome <Nachricht>");
      return;
    }
    const updated = await setGroupConfig(configStorage, target.chatId, {
      welcomeMessage: payload
    });
    await ctx.reply(
      `✅ Willkommensnachricht aktualisiert:\n\n${renderTemplate(
        updated.welcomeMessage,
        target.chatTitle
      )}`
    );
  });

  bot.command("setrules", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const payload = extractCommandPayload(ctx);
    if (!payload) {
      await ctx.reply("Nutzung: /setrules <Nachricht>");
      return;
    }
    const updated = await setGroupConfig(configStorage, target.chatId, {
      rulesMessage: payload
    });
    await ctx.reply(
      `✅ Regeln aktualisiert:\n\n${renderTemplate(updated.rulesMessage, target.chatTitle)}`
    );
  });

  bot.command("showwelcome", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const config = await getGroupConfig(configStorage, target.chatId);
    await ctx.reply(renderTemplate(config.welcomeMessage, target.chatTitle));
  });

  bot.command("showrules", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const config = await getGroupConfig(configStorage, target.chatId);
    await ctx.reply(renderTemplate(config.rulesMessage, target.chatTitle));
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

async function resolveConfigTarget(
  ctx: MyContext
): Promise<{ chatId: number; chatTitle?: string } | null> {
  if (!ctx.chat) return null;

  if (CONFIG_CHAT_TYPES.has(ctx.chat.type) && ctx.chat.type !== "private") {
    const adminInfo = await ensureAdminForChat(ctx, ctx.chat.id);
    if (!adminInfo) return null;
    return {
      chatId: ctx.chat.id,
      chatTitle: ctx.chat.title ?? adminInfo.chatTitle
    };
  }

  if (ctx.chat.type === "private") {
    const targetChatId = ctx.session.activeConfigChatId;
    if (!targetChatId) {
      await ctx.reply("Bitte nutze /config <chat-id> oder /config in der Gruppe.");
      return null;
    }
    const adminInfo = await ensureAdminForChat(ctx, targetChatId);
    if (!adminInfo) return null;
    return { chatId: targetChatId, chatTitle: adminInfo.chatTitle };
  }

  await ctx.reply("Bitte nutze diesen Befehl in einer Gruppe oder im Privat-Chat.");
  return null;
}

async function resolveChatIdFromInput(ctx: Context, input: string): Promise<number | undefined> {
  const token = input.trim().split(/\s+/)[0];
  if (!token) return undefined;
  if (token.startsWith("@")) {
    try {
      const chat = await ctx.api.getChat(token);
      return chat.id;
    } catch (error) {
      console.error("Failed to resolve chat username", error);
      return undefined;
    }
  }
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

async function ensureAdminForChat(
  ctx: Context,
  chatId: number
): Promise<{ chatTitle?: string } | null> {
  if (!ctx.from) return null;
  let chatTitle: string | undefined;
  let chatType: string | undefined;
  try {
    const chat = await ctx.api.getChat(chatId);
    chatType = chat.type;
    if ("title" in chat && chat.title) chatTitle = chat.title;
  } catch (error) {
    console.error("Failed to fetch chat info", error);
    await ctx.reply("Konnte die Gruppe oder den Kanal nicht finden.");
    return null;
  }

  if (!chatType || !CONFIG_CHAT_TYPES.has(chatType)) {
    await ctx.reply("Bitte nutze eine Gruppe, Supergruppe oder einen Kanal.");
    return null;
  }

  try {
    const member = await ctx.api.getChatMember(chatId, ctx.from.id);
    if (ADMIN_STATUSES.has(member.status)) {
      return { chatTitle };
    }
  } catch (error) {
    console.error("Failed to check admin status", error);
  }
  await ctx.reply("Nur Admins.");
  return null;
}

function formatConfigMessage(
  config: Awaited<ReturnType<typeof getGroupConfig>>,
  chatTitle: string | undefined,
  chatId: number,
  isPrivate: boolean
): string {
  const title = chatTitle ?? String(chatId);
  const lines = [
    `Konfiguration fuer ${title}`,
    "",
    "Willkommen:",
    renderTemplate(config.welcomeMessage, chatTitle),
    "",
    "Regeln:",
    renderTemplate(config.rulesMessage, chatTitle),
    "",
    "Befehle: /setwelcome <text> | /setrules <text>"
  ];
  if (isPrivate) {
    lines.push(`Aktive Gruppe: ${chatId}`);
  } else {
    lines.push(`Privat-Chat: /config ${chatId}`);
  }
  return lines.join("\n");
}
