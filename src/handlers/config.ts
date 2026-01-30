import type { Bot, Context } from "grammy";
import type { MyContext } from "../types";
import type { ConfigStorage } from "../config/store";
import {
  addAllowlistUser,
  addDenylistUser,
  getGroupConfig,
  removeAllowlistUser,
  removeDenylistUser,
  renderTemplate,
  setGroupConfig
} from "../config/store";

const ADMIN_STATUSES = new Set(["administrator", "creator"]);
const CONFIG_CHAT_TYPES = new Set(["group", "supergroup", "channel"]);

export function registerConfigHandlers(
  bot: Bot<MyContext>,
  configStorage: ConfigStorage
): void {
  bot.command("config", async (ctx) => {
    const threadId = getMessageThreadId(ctx);
    const payload = extractCommandPayload(ctx);
    const topicsEnabled = hasPrivateTopicsEnabled(ctx);

    if (ctx.chat?.type === "private") {
      let targetChatId: number | undefined = ctx.session.activeConfigChatId;
      if (threadId) {
        targetChatId = ctx.session.configThreads?.[String(threadId)];
      }
      if (payload) {
        targetChatId = await resolveChatIdFromInput(ctx, payload);
        if (!targetChatId) {
          await ctx.reply("Nutzung: /config <chat-id oder @username>");
          return;
        }
      }

      if (!targetChatId) {
        await ctx.reply(
          threadId
            ? "Dieses Thema ist noch nicht verbunden. Nutze /config <chat-id> in diesem Thema."
            : "Bitte nutze /config <chat-id> oder /config in der Gruppe."
        );
        return;
      }

      const adminInfo = await ensureAdminForChat(ctx, targetChatId);
      if (!adminInfo) return;

      if (threadId) {
        if (!ctx.session.configThreads) ctx.session.configThreads = {};
        ctx.session.configThreads[String(threadId)] = targetChatId;
      } else {
        ctx.session.activeConfigChatId = targetChatId;
      }
      rememberManagedChat(ctx, targetChatId, adminInfo.chatTitle);
      const config = await getGroupConfig(configStorage, targetChatId);
      if (!threadId && topicsEnabled) {
        const mappedThreadId = getThreadIdForChat(ctx, targetChatId);
        if (mappedThreadId) {
          await ctx.api.sendMessage(ctx.chat.id, "Dieses Thema ist bereits verknuepft.", {
            message_thread_id: mappedThreadId
          });
        } else {
          const createdThreadId = await createPrivateTopic(ctx, adminInfo.chatTitle, targetChatId);
          if (createdThreadId) {
            if (!ctx.session.configThreads) ctx.session.configThreads = {};
            ctx.session.configThreads[String(createdThreadId)] = targetChatId;
            await ctx.api.sendMessage(
              ctx.chat.id,
              formatConfigMessage(config, adminInfo.chatTitle, targetChatId, true, createdThreadId),
              { message_thread_id: createdThreadId }
            );
            await ctx.reply("Thema erstellt und verbunden. Siehe das neue Thema.");
            return;
          }
        }
      }

      await ctx.reply(formatConfigMessage(config, adminInfo.chatTitle, targetChatId, true, threadId));
      return;
    }

    if (ctx.chat && CONFIG_CHAT_TYPES.has(ctx.chat.type)) {
      const adminInfo = await ensureAdminForChat(ctx, ctx.chat.id);
      if (!adminInfo) return;
      ctx.session.activeConfigChatId = ctx.chat.id;
      rememberManagedChat(ctx, ctx.chat.id, ctx.chat.title ?? adminInfo.chatTitle);
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

  bot.command("allow", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const userId = await resolveTargetUserId(ctx);
    if (!userId) {
      await ctx.reply("Nutzung: /allow <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }
    const updated = await addAllowlistUser(configStorage, target.chatId, userId);
    await ctx.reply(`✅ Allowlist aktualisiert (${updated.allowlist.length}).`);
  });

  bot.command("deny", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const userId = await resolveTargetUserId(ctx);
    if (!userId) {
      await ctx.reply("Nutzung: /deny <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }
    const updated = await addDenylistUser(configStorage, target.chatId, userId);
    await ctx.reply(`✅ Denylist aktualisiert (${updated.denylist.length}).`);
  });

  bot.command("unallow", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const userId = await resolveTargetUserId(ctx);
    if (!userId) {
      await ctx.reply("Nutzung: /unallow <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }
    const updated = await removeAllowlistUser(configStorage, target.chatId, userId);
    await ctx.reply(`✅ Allowlist aktualisiert (${updated.allowlist.length}).`);
  });

  bot.command("undeny", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const userId = await resolveTargetUserId(ctx);
    if (!userId) {
      await ctx.reply("Nutzung: /undeny <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }
    const updated = await removeDenylistUser(configStorage, target.chatId, userId);
    await ctx.reply(`✅ Denylist aktualisiert (${updated.denylist.length}).`);
  });

  bot.command("listallow", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const config = await getGroupConfig(configStorage, target.chatId);
    const ids = config.allowlist.map((id) => id.toString()).join(", ");
    await ctx.reply(
      config.allowlist.length
        ? `Allowlist (${config.allowlist.length}): ${ids}`
        : "Allowlist ist leer."
    );
  });

  bot.command("listdeny", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const config = await getGroupConfig(configStorage, target.chatId);
    const ids = config.denylist.map((id) => id.toString()).join(", ");
    await ctx.reply(
      config.denylist.length
        ? `Denylist (${config.denylist.length}): ${ids}`
        : "Denylist ist leer."
    );
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
    rememberManagedChat(ctx, ctx.chat.id, ctx.chat.title ?? adminInfo.chatTitle);
    return {
      chatId: ctx.chat.id,
      chatTitle: ctx.chat.title ?? adminInfo.chatTitle
    };
  }

  if (ctx.chat.type === "private") {
    const threadId = getMessageThreadId(ctx);
    let targetChatId: number | undefined;
    if (threadId) {
      targetChatId = ctx.session.configThreads?.[String(threadId)];
      if (!targetChatId) {
        await ctx.reply("Dieses Thema ist noch nicht verbunden. Nutze /config <chat-id> hier.");
        return null;
      }
    } else {
      targetChatId = ctx.session.activeConfigChatId;
      if (!targetChatId) {
        await ctx.reply("Bitte nutze /config <chat-id> oder /config in der Gruppe.");
        return null;
      }
    }
    const adminInfo = await ensureAdminForChat(ctx, targetChatId);
    if (!adminInfo) return null;
    rememberManagedChat(ctx, targetChatId, adminInfo.chatTitle);
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

async function resolveTargetUserId(ctx: Context): Promise<number | undefined> {
  const payload = extractCommandPayload(ctx);
  if (!payload) {
    const replyUser = ctx.message?.reply_to_message?.from?.id;
    return replyUser ?? undefined;
  }

  const token = payload.trim().split(/\s+/)[0];
  if (!token) return undefined;
  if (token.startsWith("@")) {
    try {
      const chat = await ctx.api.getChat(token);
      return chat.id;
    } catch (error) {
      console.error("Failed to resolve user", error);
      return undefined;
    }
  }
  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

async function ensureAdminForChat(
  ctx: MyContext,
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
      rememberManagedChat(ctx, chatId, chatTitle);
      return { chatTitle };
    }
  } catch (error) {
    console.error("Failed to check admin status", error);
  }
  await ctx.reply("Nur Admins.");
  return null;
}

function rememberManagedChat(ctx: MyContext, chatId: number, chatTitle?: string): void {
  if (!ctx.session.managedChats) ctx.session.managedChats = {};
  ctx.session.managedChats[String(chatId)] = {
    title: chatTitle,
    lastSeen: Date.now()
  };
}

function getThreadIdForChat(ctx: MyContext, chatId: number): number | undefined {
  const configThreads = ctx.session.configThreads ?? {};
  for (const [threadKey, mappedChatId] of Object.entries(configThreads)) {
    if (mappedChatId === chatId) {
      const threadId = Number(threadKey);
      return Number.isFinite(threadId) ? threadId : undefined;
    }
  }
  return undefined;
}

function hasPrivateTopicsEnabled(ctx: Context): boolean {
  const user = ctx.from as { has_topics_enabled?: boolean } | undefined;
  return Boolean(user?.has_topics_enabled);
}

async function createPrivateTopic(
  ctx: Context,
  title: string | undefined,
  chatId: number
): Promise<number | undefined> {
  if (!ctx.chat) return undefined;
  const topicName = title ? `${title}` : `Chat ${chatId}`;
  try {
    const topic = await ctx.api.createForumTopic(ctx.chat.id, topicName);
    return topic.message_thread_id;
  } catch (error) {
    console.error("Failed to create private topic", error);
    return undefined;
  }
}

function getMessageThreadId(ctx: Context): number | undefined {
  const message = ctx.message as { message_thread_id?: number } | undefined;
  const threadId = message?.message_thread_id;
  return typeof threadId === "number" ? threadId : undefined;
}

function formatConfigMessage(
  config: Awaited<ReturnType<typeof getGroupConfig>>,
  chatTitle: string | undefined,
  chatId: number,
  isPrivate: boolean,
  threadId?: number
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
    `Allowlist: ${config.allowlist.length} | Denylist: ${config.denylist.length} | Cache: ${
      Object.keys(config.verifiedUsers).length
    }`,
    "Befehle: /setwelcome <text> | /setrules <text> | /allow | /deny"
  ];
  if (isPrivate) {
    if (threadId) {
      lines.push(`Thema: ${threadId}`);
    }
    lines.push(`Aktive Gruppe: ${chatId}`);
  } else {
    lines.push(`Privat-Chat: /config ${chatId}`);
  }
  return lines.join("\n");
}
