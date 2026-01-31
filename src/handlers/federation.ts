import type { Bot } from "grammy";
import type { MyContext } from "../types";
import type { FederationStores } from "../federation/store";
import {
  addFederationBan,
  addFederationChat,
  getFederation,
  getFederationForChat,
  removeFederationBan,
  removeFederationChat
} from "../federation/store";
import {
  MUTE_PERMISSIONS,
  UNMUTE_PERMISSIONS,
  ensureBotPermissions,
  ensureGroupAdmin,
  extractCommandArgs,
  extractCommandPayload,
  formatUserLabel,
  parseDurationMs,
  resolveTargetUser,
  toUntilDate
} from "../moderation/helpers";

const FED_CHAT_TYPES = new Set(["group", "supergroup"]);

export function registerFederationHandlers(
  bot: Bot<MyContext>,
  stores: FederationStores
): void {
  bot.command("fedset", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const args = extractCommandArgs(ctx);
    const fedChatId = Number(args[0]);
    if (!Number.isFinite(fedChatId)) {
      await ctx.reply("Nutzung: /fedset <federal_chat_id>");
      return;
    }

    if (!FED_CHAT_TYPES.has(ctx.chat?.type ?? "")) {
      await ctx.reply("Bitte nutze diesen Befehl in einer Gruppe oder Supergruppe.");
      return;
    }

    const federation = await getFederation(stores, fedChatId);
    if (!federation) {
      await ctx.reply("Federation nicht gefunden. Nutze /fedadd im Federal-Chat.");
      return;
    }

    try {
      const fedChat = await ctx.api.getChat(fedChatId);
      if (!FED_CHAT_TYPES.has(fedChat.type)) {
        await ctx.reply("Die Federation muss eine Gruppe oder Supergruppe sein.");
        return;
      }
    } catch (error) {
      console.error("Failed to fetch federation chat", error);
      await ctx.reply("Federal-Chat konnte nicht gefunden werden.");
      return;
    }

    await addFederationChat(stores, fedChatId, admin.chatId);
    await ctx.reply(`✅ Gruppe mit Federation ${fedChatId} verknüpft.`);
  });

  bot.command("fedadd", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const args = extractCommandArgs(ctx);
    const chatId = Number(args[0]);
    if (!Number.isFinite(chatId)) {
      await ctx.reply("Nutzung: /fedadd <chat_id>");
      return;
    }

    try {
      const chat = await ctx.api.getChat(chatId);
      if (!FED_CHAT_TYPES.has(chat.type)) {
        await ctx.reply("Nur Gruppen oder Supergruppen können hinzugefügt werden.");
        return;
      }
    } catch (error) {
      console.error("Failed to fetch chat for fedadd", error);
      await ctx.reply("Chat konnte nicht gefunden werden.");
      return;
    }

    const updated = await addFederationChat(stores, admin.chatId, chatId);
    await ctx.reply(`✅ Federation aktualisiert. Gruppen: ${updated.linkedChats.length}.`);
  });

  bot.command("fedremove", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const args = extractCommandArgs(ctx);
    const chatId = Number(args[0]);
    if (!Number.isFinite(chatId)) {
      await ctx.reply("Nutzung: /fedremove <chat_id>");
      return;
    }

    const updated = await removeFederationChat(stores, admin.chatId, chatId);
    await ctx.reply(`✅ Federation aktualisiert. Gruppen: ${updated.linkedChats.length}.`);
  });

  bot.command("fedlist", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const record = await getFederation(stores, admin.chatId);
    if (!record || record.linkedChats.length === 0) {
      await ctx.reply("Keine verknüpften Gruppen.");
      return;
    }
    const list = record.linkedChats.map((id) => id.toString()).join(", ");
    await ctx.reply(`Verknüpfte Gruppen (${record.linkedChats.length}): ${list}`);
  });

  bot.command("fedinfo", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const directRecord = await getFederation(stores, admin.chatId);
    if (directRecord) {
      await ctx.reply(
        `Federation: ${directRecord.fedChatId} | Gruppen: ${directRecord.linkedChats.length} | fBans: ${directRecord.bannedUsers.length}`
      );
      return;
    }

    const linkedRecord = await getFederationForChat(stores, admin.chatId);
    if (!linkedRecord) {
      await ctx.reply("Diese Gruppe ist keiner Federation zugeordnet.");
      return;
    }
    await ctx.reply(
      `Federation: ${linkedRecord.fedChatId} | Gruppen: ${linkedRecord.linkedChats.length} | fBans: ${linkedRecord.bannedUsers.length}`
    );
  });

  bot.command("fban", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const record = await getFederation(stores, admin.chatId);
    if (!record) {
      await ctx.reply("Dies ist keine Federation. Nutze /fedadd im Federal-Chat.");
      return;
    }

    const payload = extractCommandPayload(ctx);
    const [targetToken, ...rest] = payload.split(/\s+/).filter(Boolean);
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /fban <user-id oder @username> [Grund]");
      return;
    }
    const reason = rest.join(" ").trim();

    const updated = await addFederationBan(stores, admin.chatId, target.userId);
    const result = await applyFederatedAction(
      ctx,
      updated.linkedChats,
      (chatId) => ctx.api.banChatMember(chatId, target.userId)
    );
    const label = formatUserLabel(target.user, target.userId);
    await ctx.reply(buildFederationSummary("fban", label, reason, result));
  });

  bot.command("funban", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const record = await getFederation(stores, admin.chatId);
    if (!record) {
      await ctx.reply("Dies ist keine Federation. Nutze /fedadd im Federal-Chat.");
      return;
    }

    const payload = extractCommandPayload(ctx);
    const [targetToken] = payload.split(/\s+/).filter(Boolean);
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /funban <user-id oder @username>");
      return;
    }

    const updated = await removeFederationBan(stores, admin.chatId, target.userId);
    const result = await applyFederatedAction(
      ctx,
      updated.linkedChats,
      (chatId) => ctx.api.unbanChatMember(chatId, target.userId)
    );
    const label = formatUserLabel(target.user, target.userId);
    await ctx.reply(buildFederationSummary("funban", label, undefined, result));
  });

  bot.command("fmute", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const record = await getFederation(stores, admin.chatId);
    if (!record) {
      await ctx.reply("Dies ist keine Federation. Nutze /fedadd im Federal-Chat.");
      return;
    }

    const payload = extractCommandPayload(ctx);
    const tokens = payload.split(/\s+/).filter(Boolean);
    const targetToken = tokens.shift();
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /fmute <user-id oder @username> [10m|2h|1d] [Grund]");
      return;
    }

    const durationResult = parseDurationMs(tokens[0]);
    if (durationResult.error) {
      await ctx.reply(durationResult.error);
      return;
    }
    const durationMs = durationResult.ms;
    if (durationMs) tokens.shift();
    const reason = tokens.join(" ").trim();
    const untilDate = durationMs ? toUntilDate(durationMs) : undefined;

    const result = await applyFederatedAction(
      ctx,
      record.linkedChats,
      (chatId) =>
        ctx.api.restrictChatMember(chatId, target.userId, MUTE_PERMISSIONS, {
          until_date: untilDate
        })
    );
    const label = formatUserLabel(target.user, target.userId);
    const durationText = durationMs ? ` für ${formatDuration(durationMs)}` : " dauerhaft";
    await ctx.reply(buildFederationSummary(`fmute${durationText}`, label, reason, result));
  });

  bot.command("funmute", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const record = await getFederation(stores, admin.chatId);
    if (!record) {
      await ctx.reply("Dies ist keine Federation. Nutze /fedadd im Federal-Chat.");
      return;
    }

    const payload = extractCommandPayload(ctx);
    const [targetToken] = payload.split(/\s+/).filter(Boolean);
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /funmute <user-id oder @username>");
      return;
    }

    const result = await applyFederatedAction(
      ctx,
      record.linkedChats,
      (chatId) => ctx.api.restrictChatMember(chatId, target.userId, UNMUTE_PERMISSIONS)
    );
    const label = formatUserLabel(target.user, target.userId);
    await ctx.reply(buildFederationSummary("funmute", label, undefined, result));
  });
}

type FederationActionResult = {
  success: number;
  failed: number;
  failedChats: number[];
};

async function applyFederatedAction(
  ctx: MyContext,
  chatIds: number[],
  action: (chatId: number) => Promise<unknown>
): Promise<FederationActionResult> {
  const uniqueChats = Array.from(new Set(chatIds));
  let success = 0;
  const failedChats: number[] = [];

  for (const chatId of uniqueChats) {
    try {
      await action(chatId);
      success += 1;
    } catch (error) {
      console.error(`Federation action failed for ${chatId}`, error);
      failedChats.push(chatId);
    }
  }

  return {
    success,
    failed: failedChats.length,
    failedChats
  };
}

function buildFederationSummary(
  action: string,
  label: string,
  reason: string | undefined,
  result: FederationActionResult
): string {
  const lines = [
    `Federation ${action}: ${label}`,
    reason ? `Grund: ${reason}` : undefined,
    `Erfolg: ${result.success} | Fehlgeschlagen: ${result.failed}`
  ].filter(Boolean) as string[];

  if (result.failedChats.length > 0) {
    const preview = result.failedChats.slice(0, 10).join(", ");
    const suffix = result.failedChats.length > 10 ? " ..." : "";
    lines.push(`Fehler in Chats: ${preview}${suffix}`);
  }

  return lines.join("\n");
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h`;
  const totalDays = Math.floor(totalHours / 24);
  return `${totalDays}d`;
}
