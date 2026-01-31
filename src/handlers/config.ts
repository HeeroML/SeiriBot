import { InlineKeyboard, type Bot, type Context } from "grammy";
import type { MyContext } from "../types";
import type { ConfigStorage } from "../config/store";
import type { KeyValueStorage } from "../storage/namespaced";
import type { ConfigLinkStore } from "../storage/types";
import {
  addAllowlistUser,
  addDenylistUser,
  getGroupConfig,
  removeAllowlistUser,
  removeDenylistUser,
  renderTemplate,
  setGroupConfig
} from "../config/store";
import { loadManagedGroups, recordManagedGroup, type ManagedGroup } from "../config/managedGroups";
import { generateNonce } from "../captcha/pattern";

const ADMIN_STATUSES = new Set(["administrator", "creator"]);
const CONFIG_CHAT_TYPES = new Set(["group", "supergroup", "channel"]);

type WebAppConfig = {
  url: string;
  linkStore: ConfigLinkStore;
  linkTtlMs: number;
};

export function registerConfigHandlers(
  bot: Bot<MyContext>,
  deps: {
    configStorage: ConfigStorage;
    metaStorage: KeyValueStorage;
    webApp?: WebAppConfig;
  }
): void {
  const { configStorage, metaStorage, webApp } = deps;
  bot.command("config", async (ctx) => {
    if (ctx.chat?.type === "private") {
      await showManagedGroupsMenu(ctx, metaStorage, true);
      return;
    }

    if (ctx.chat && CONFIG_CHAT_TYPES.has(ctx.chat.type)) {
      if (!ctx.from) return;
      const adminInfo = await ensureAdminForChat(ctx, ctx.chat.id);
      if (!adminInfo) return;
      await recordManagedGroup(metaStorage, ctx.from.id, ctx.chat.id, adminInfo.chatTitle);

      if (webApp?.url) {
        try {
          const expiresAt = Date.now() + webApp.linkTtlMs;
          const nonce = generateNonce(8);
          await webApp.linkStore.create({
            nonce,
            chatId: ctx.chat.id,
            userId: ctx.from.id,
            expiresAt
          });
          const webAppUrl = buildWebAppUrl(webApp.url, ctx.chat.id, nonce);
          const keyboard = new InlineKeyboard().webApp("WebApp oeffnen", webAppUrl);
          await ctx.reply("Oeffne die Konfiguration im WebApp.", { reply_markup: keyboard });
          return;
        } catch (error) {
          console.error("Failed to create WebApp link", error);
        }
      }

      await showConfigMenu(ctx, configStorage, metaStorage, ctx.chat.id, false);
      return;
    }

    await ctx.reply("Bitte nutze diesen Befehl in einer Gruppe oder im Privat-Chat.");
  });

  bot.callbackQuery(/^cfg\|/, async (ctx) => {
    const parsed = parseConfigCallback(ctx.callbackQuery.data ?? "");
    if (!parsed) return;

    await ctx.answerCallbackQuery();

    if (parsed.action === "groups") {
      await showManagedGroupsMenu(ctx, metaStorage, true);
      return;
    }

    if (!parsed.chatId || !Number.isFinite(parsed.chatId)) return;

    if (parsed.action === "select" || parsed.action === "menu") {
      await showConfigMenu(ctx, configStorage, metaStorage, parsed.chatId, true);
      return;
    }

    if (parsed.action === "cancel") {
      ctx.session.configPending = undefined;
      await ctx.reply("✅ Abgebrochen.");
      await showConfigMenu(ctx, configStorage, metaStorage, parsed.chatId, true);
      return;
    }

    if (!ctx.from) return;
    const adminInfo = await ensureAdminForChat(ctx, parsed.chatId);
    if (!adminInfo) return;
    await recordManagedGroup(metaStorage, ctx.from.id, parsed.chatId, adminInfo.chatTitle);

    if (parsed.action === "welcome") {
      ctx.session.configPending = {
        action: "setWelcome",
        chatId: parsed.chatId,
        chatTitle: adminInfo.chatTitle,
        originChatId: ctx.chat?.id ?? parsed.chatId
      };
      await ctx.reply("Bitte sende die neue Willkommensnachricht.", {
        reply_markup: buildCancelKeyboard(parsed.chatId)
      });
      return;
    }

    if (parsed.action === "rules") {
      ctx.session.configPending = {
        action: "setRules",
        chatId: parsed.chatId,
        chatTitle: adminInfo.chatTitle,
        originChatId: ctx.chat?.id ?? parsed.chatId
      };
      await ctx.reply("Bitte sende die neuen Regeln.", {
        reply_markup: buildCancelKeyboard(parsed.chatId)
      });
      return;
    }

    if (parsed.action === "toggle") {
      const config = await getGroupConfig(configStorage, parsed.chatId);
      await setGroupConfig(configStorage, parsed.chatId, {
        deleteServiceMessages: !config.deleteServiceMessages
      });
      await showConfigMenu(ctx, configStorage, metaStorage, parsed.chatId, true);
      return;
    }

    if (parsed.action === "clear") {
      const config = await getGroupConfig(configStorage, parsed.chatId);
      const previousCount = Object.keys(config.verifiedUsers).length;
      await setGroupConfig(configStorage, parsed.chatId, { verifiedUsers: {} });
      await ctx.reply(
        previousCount > 0
          ? `✅ Verifizierungs-Cache geleert (${previousCount}).`
          : "✅ Verifizierungs-Cache ist bereits leer."
      );
      await showConfigMenu(ctx, configStorage, metaStorage, parsed.chatId, true);
      return;
    }

    if (parsed.action === "allowlist" || parsed.action === "denylist") {
      const config = await getGroupConfig(configStorage, parsed.chatId);
      const listType = parsed.action === "allowlist" ? "allow" : "deny";
      const ids = listType === "allow" ? config.allowlist : config.denylist;
      const text = formatListMessage(listType, ids);
      const keyboard = buildListMenuKeyboard(parsed.chatId, listType, ctx.chat?.type === "private");
      await respondWithMenu(ctx, text, keyboard, true);
      return;
    }

    if (parsed.action === "addallow" || parsed.action === "adddeny") {
      ctx.session.configPending = {
        action: parsed.action === "addallow" ? "addAllow" : "addDeny",
        chatId: parsed.chatId,
        chatTitle: adminInfo.chatTitle,
        originChatId: ctx.chat?.id ?? parsed.chatId
      };
      await ctx.reply("Bitte sende die User-ID oder @username (oder antworte auf eine Nachricht).", {
        reply_markup: buildCancelKeyboard(parsed.chatId)
      });
      return;
    }

    if (parsed.action === "remallow" || parsed.action === "remdeny") {
      ctx.session.configPending = {
        action: parsed.action === "remallow" ? "removeAllow" : "removeDeny",
        chatId: parsed.chatId,
        chatTitle: adminInfo.chatTitle,
        originChatId: ctx.chat?.id ?? parsed.chatId
      };
      await ctx.reply("Bitte sende die User-ID oder @username (oder antworte auf eine Nachricht).", {
        reply_markup: buildCancelKeyboard(parsed.chatId)
      });
      return;
    }

  });

  bot.on("message:text", async (ctx) => {
    const pending = ctx.session.configPending;
    if (!pending) return;
    if (!ctx.chat || ctx.chat.id !== pending.originChatId) return;

    const text = ctx.message?.text?.trim();
    if (!text) return;
    if (text === "/cancel") {
      ctx.session.configPending = undefined;
      await ctx.reply("✅ Abgebrochen.");
      await showConfigMenu(ctx, configStorage, metaStorage, pending.chatId, false);
      return;
    }

    if (text.startsWith("/")) {
      await ctx.reply("Bitte sende den Text oder /cancel.");
      return;
    }

    if (pending.action === "setWelcome") {
      const updated = await setGroupConfig(configStorage, pending.chatId, {
        welcomeMessage: text
      });
      const chatTitle = pending.chatTitle ?? (await resolveChatTitle(ctx, pending.chatId));
      await ctx.reply(
        `✅ Willkommensnachricht aktualisiert:\n\n${renderTemplate(
          updated.welcomeMessage,
          chatTitle
        )}`
      );
      ctx.session.configPending = undefined;
      await showConfigMenu(ctx, configStorage, metaStorage, pending.chatId, false);
      return;
    }

    if (pending.action === "setRules") {
      const updated = await setGroupConfig(configStorage, pending.chatId, {
        rulesMessage: text
      });
      const chatTitle = pending.chatTitle ?? (await resolveChatTitle(ctx, pending.chatId));
      await ctx.reply(
        `✅ Regeln aktualisiert:\n\n${renderTemplate(updated.rulesMessage, chatTitle)}`
      );
      ctx.session.configPending = undefined;
      await showConfigMenu(ctx, configStorage, metaStorage, pending.chatId, false);
      return;
    }

    if (
      pending.action === "addAllow" ||
      pending.action === "addDeny" ||
      pending.action === "removeAllow" ||
      pending.action === "removeDeny"
    ) {
      const userId = await resolveUserIdFromMessage(ctx);
      if (!userId) {
        await ctx.reply("Bitte sende die User-ID oder @username (oder antworte auf eine Nachricht).");
        return;
      }

      let updated;
      if (pending.action === "addAllow") {
        updated = await addAllowlistUser(configStorage, pending.chatId, userId);
        await ctx.reply(`✅ Allowlist aktualisiert (${updated.allowlist.length}).`);
      } else if (pending.action === "addDeny") {
        updated = await addDenylistUser(configStorage, pending.chatId, userId);
        await ctx.reply(`✅ Denylist aktualisiert (${updated.denylist.length}).`);
      } else if (pending.action === "removeAllow") {
        updated = await removeAllowlistUser(configStorage, pending.chatId, userId);
        await ctx.reply(`✅ Allowlist aktualisiert (${updated.allowlist.length}).`);
      } else {
        updated = await removeDenylistUser(configStorage, pending.chatId, userId);
        await ctx.reply(`✅ Denylist aktualisiert (${updated.denylist.length}).`);
      }

      ctx.session.configPending = undefined;
      await showConfigMenu(ctx, configStorage, metaStorage, pending.chatId, false);
    }
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

  bot.command("clearverified", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const config = await getGroupConfig(configStorage, target.chatId);
    const previousCount = Object.keys(config.verifiedUsers).length;
    await setGroupConfig(configStorage, target.chatId, { verifiedUsers: {} });
    await ctx.reply(
      previousCount > 0
        ? `✅ Verifizierungs-Cache geleert (${previousCount}).`
        : "✅ Verifizierungs-Cache ist bereits leer."
    );
  });

  bot.command("delserv", async (ctx) => {
    const target = await resolveConfigTarget(ctx);
    if (!target) return;
    const payload = extractCommandPayload(ctx).toLowerCase();
    if (!payload || (payload !== "on" && payload !== "off")) {
      await ctx.reply("Nutzung: /delserv on|off");
      return;
    }
    const deleteServiceMessages = payload === "on";
    await setGroupConfig(configStorage, target.chatId, { deleteServiceMessages });
    await ctx.reply(
      deleteServiceMessages
        ? "✅ Service-Nachrichten werden gelöscht."
        : "✅ Service-Nachrichten bleiben sichtbar."
    );
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

type ConfigCallback = {
  action:
    | "groups"
    | "select"
    | "menu"
    | "welcome"
    | "rules"
    | "toggle"
    | "clear"
    | "allowlist"
    | "denylist"
    | "addallow"
    | "adddeny"
    | "remallow"
    | "remdeny"
    | "cancel";
  chatId?: number;
};

const CONFIG_CALLBACK_ACTIONS: ReadonlySet<ConfigCallback["action"]> = new Set([
  "groups",
  "select",
  "menu",
  "welcome",
  "rules",
  "toggle",
  "clear",
  "allowlist",
  "denylist",
  "addallow",
  "adddeny",
  "remallow",
  "remdeny",
  "cancel"
]);

function parseConfigCallback(data: string): ConfigCallback | null {
  if (!data.startsWith("cfg|")) return null;
  const parts = data.split("|");
  const action = parts[1] as ConfigCallback["action"] | undefined;
  if (!action || !CONFIG_CALLBACK_ACTIONS.has(action)) return null;

  if (action === "groups") {
    return { action };
  }

  const chatId = Number(parts[2]);
  if (!Number.isFinite(chatId)) return null;
  return { action, chatId };
}

function buildConfigCallbackData(action: ConfigCallback["action"], chatId?: number): string {
  return chatId === undefined ? `cfg|${action}` : `cfg|${action}|${chatId}`;
}

function buildConfigMenuKeyboard(
  chatId: number,
  config: Awaited<ReturnType<typeof getGroupConfig>>,
  showBackToGroups: boolean
): InlineKeyboard {
  const keyboard = new InlineKeyboard()
    .text("Willkommensnachricht", buildConfigCallbackData("welcome", chatId))
    .text("Regeln", buildConfigCallbackData("rules", chatId))
    .row()
    .text(
      `Service-Nachrichten: ${config.deleteServiceMessages ? "on" : "off"}`,
      buildConfigCallbackData("toggle", chatId)
    )
    .row()
    .text(`Allowlist (${config.allowlist.length})`, buildConfigCallbackData("allowlist", chatId))
    .text(`Denylist (${config.denylist.length})`, buildConfigCallbackData("denylist", chatId))
    .row()
    .text("Verifizierungs-Cache leeren", buildConfigCallbackData("clear", chatId));

  if (showBackToGroups) {
    keyboard.row().text("⬅️ Gruppen", buildConfigCallbackData("groups"));
  }

  return keyboard;
}

function buildListMenuKeyboard(
  chatId: number,
  listType: "allow" | "deny",
  showBackToGroups: boolean
): InlineKeyboard {
  const addAction = listType === "allow" ? "addallow" : "adddeny";
  const removeAction = listType === "allow" ? "remallow" : "remdeny";
  const keyboard = new InlineKeyboard()
    .text("Hinzufügen", buildConfigCallbackData(addAction, chatId))
    .text("Entfernen", buildConfigCallbackData(removeAction, chatId))
    .row()
    .text("⬅️ Zurück", buildConfigCallbackData("menu", chatId));

  if (showBackToGroups) {
    keyboard.row().text("⬅️ Gruppen", buildConfigCallbackData("groups"));
  }

  return keyboard;
}

function buildCancelKeyboard(chatId: number): InlineKeyboard {
  return new InlineKeyboard().text("Abbrechen", buildConfigCallbackData("cancel", chatId));
}

async function respondWithMenu(
  ctx: MyContext,
  text: string,
  keyboard: InlineKeyboard,
  preferEdit: boolean
): Promise<void> {
  if (preferEdit && ctx.callbackQuery?.message?.message_id) {
    try {
      await ctx.editMessageText(text, { reply_markup: keyboard });
      return;
    } catch (error) {
      // Ignore edit failures and send a new message.
    }
  }
  await ctx.reply(text, { reply_markup: keyboard });
}

async function showManagedGroupsMenu(
  ctx: MyContext,
  metaStorage: KeyValueStorage,
  preferEdit: boolean
): Promise<void> {
  if (!ctx.from) return;
  const groups = await loadManagedGroups(metaStorage, ctx.from.id);
  if (!groups.length) {
    const text =
      "Keine verwalteten Gruppen gefunden. Öffne /config in einer Gruppe, in der du Admin bist.";
    if (preferEdit && ctx.callbackQuery?.message?.message_id) {
      try {
        await ctx.editMessageText(text);
        return;
      } catch (error) {
        // Ignore edit failures and send a new message.
      }
    }
    await ctx.reply(text);
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const group of groups) {
    keyboard.text(formatGroupLabel(group), buildConfigCallbackData("select", group.chatId)).row();
  }

  await respondWithMenu(ctx, "Wähle eine Gruppe, um die Konfiguration zu öffnen.", keyboard, preferEdit);
}

async function showConfigMenu(
  ctx: MyContext,
  configStorage: ConfigStorage,
  metaStorage: KeyValueStorage,
  chatId: number,
  preferEdit: boolean
): Promise<void> {
  const adminInfo = await ensureAdminForChat(ctx, chatId);
  if (!adminInfo) return;
  if (ctx.from) {
    await recordManagedGroup(metaStorage, ctx.from.id, chatId, adminInfo.chatTitle);
  }

  const config = await getGroupConfig(configStorage, chatId);
  const chatTitle = adminInfo.chatTitle ?? (ctx.chat?.type !== "private" ? ctx.chat?.title : undefined);
  const text = formatConfigMessage(config, chatTitle, chatId);
  const keyboard = buildConfigMenuKeyboard(chatId, config, ctx.chat?.type === "private");
  await respondWithMenu(ctx, text, keyboard, preferEdit);
}

function formatListMessage(listType: "allow" | "deny", ids: number[]): string {
  const title = listType === "allow" ? "Allowlist" : "Denylist";
  if (!ids.length) return `${title} ist leer.`;
  return `${title} (${ids.length}): ${formatUserIdList(ids)}`;
}

function formatUserIdList(ids: number[]): string {
  const joined = ids.map((id) => id.toString()).join(", ");
  if (joined.length <= 3500) return joined;
  const slice = ids.slice(0, 50).map((id) => id.toString()).join(", ");
  return `${slice} ... (+${ids.length - 50})`;
}

function formatGroupLabel(group: ManagedGroup): string {
  if (!group.title) return String(group.chatId);
  const trimmed = group.title.trim();
  if (trimmed.length <= 48) return trimmed;
  return `${trimmed.slice(0, 45)}...`;
}

function buildWebAppUrl(baseUrl: string, chatId: number, nonce: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("chatId", String(chatId));
  url.searchParams.set("nonce", nonce);
  return url.toString();
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

  await ctx.reply("Bitte nutze diesen Befehl in einer Gruppe.");
  return null;
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

async function resolveUserIdFromMessage(ctx: Context): Promise<number | undefined> {
  const text = ctx.message?.text ?? "";
  if (!text.trim()) {
    const replyUser = ctx.message?.reply_to_message?.from?.id;
    return replyUser ?? undefined;
  }

  const token = text.trim().split(/\s+/)[0];
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

async function resolveChatTitle(ctx: Context, chatId: number): Promise<string | undefined> {
  try {
    const chat = await ctx.api.getChat(chatId);
    if ("title" in chat && chat.title) return chat.title;
  } catch (error) {
    console.error("Failed to fetch chat title", error);
  }
  return undefined;
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
  chatId: number
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
    `Service-Nachrichten löschen: ${config.deleteServiceMessages ? "on" : "off"}`,
    "Nutze die Buttons unten, um Einstellungen zu ändern."
  ];
  return lines.join("\n");
}
