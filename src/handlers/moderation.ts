import type { Bot } from "grammy";
import type { MyContext } from "../types";
import type { WarningStore } from "../moderation/warnings";
import { decrementWarning, getWarning, incrementWarning } from "../moderation/warnings";
import {
  LOCK_PERMISSIONS,
  MUTE_PERMISSIONS,
  UNLOCK_PERMISSIONS,
  UNMUTE_PERMISSIONS,
  ensureBotPermissions,
  ensureGroupAdmin,
  extractCommandArgs,
  extractCommandPayload,
  formatUserLabel,
  parseOptionalDurationMs,
  resolveTargetUser,
  toUntilDate
} from "../moderation/helpers";

const MAX_PURGE = 100;

export function registerModerationHandlers(
  bot: Bot<MyContext>,
  warningStore: WarningStore
): void {
  bot.command("ban", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const payload = extractCommandPayload(ctx);
    const [targetToken, ...rest] = payload.split(/\s+/).filter(Boolean);
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /ban <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }
    const reason = rest.join(" ").trim();

    try {
      await ctx.api.banChatMember(admin.chatId, target.userId);
      const label = formatUserLabel(target.user, target.userId);
      await ctx.reply(
        reason
          ? `🚫 ${label} wurde gebannt. Grund: ${reason}`
          : `🚫 ${label} wurde gebannt.`
      );
    } catch (error) {
      console.error("Failed to ban user", error);
      await ctx.reply("Konnte den Nutzer nicht bannen.");
    }
  });

  bot.command("unban", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const payload = extractCommandPayload(ctx);
    const [targetToken] = payload.split(/\s+/).filter(Boolean);
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /unban <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }

    try {
      await ctx.api.unbanChatMember(admin.chatId, target.userId);
      const label = formatUserLabel(target.user, target.userId);
      await ctx.reply(`✅ ${label} wurde entbannt.`);
    } catch (error) {
      console.error("Failed to unban user", error);
      await ctx.reply("Konnte den Nutzer nicht entbannen.");
    }
  });

  bot.command("kick", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const payload = extractCommandPayload(ctx);
    const [targetToken, ...rest] = payload.split(/\s+/).filter(Boolean);
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /kick <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }
    const reason = rest.join(" ").trim();

    try {
      await ctx.api.banChatMember(admin.chatId, target.userId);
      await ctx.api.unbanChatMember(admin.chatId, target.userId);
      const label = formatUserLabel(target.user, target.userId);
      await ctx.reply(
        reason
          ? `👢 ${label} wurde entfernt. Grund: ${reason}`
          : `👢 ${label} wurde entfernt.`
      );
    } catch (error) {
      console.error("Failed to kick user", error);
      await ctx.reply("Konnte den Nutzer nicht entfernen.");
    }
  });

  bot.command("mute", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const payload = extractCommandPayload(ctx);
    const tokens = payload.split(/\s+/).filter(Boolean);
    const targetToken = tokens.shift();
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /mute <user-id oder @username> [10m|2h|1d] [Grund]");
      return;
    }

    const durationResult = parseOptionalDurationMs(tokens);
    if (durationResult.error) {
      await ctx.reply(durationResult.error);
      return;
    }
    const durationMs = durationResult.ms;
    const reason = durationResult.remainingTokens.join(" ").trim();
    const untilDate = durationMs ? toUntilDate(durationMs) : undefined;

    try {
      await ctx.api.restrictChatMember(admin.chatId, target.userId, MUTE_PERMISSIONS, {
        until_date: untilDate
      });
      const label = formatUserLabel(target.user, target.userId);
      const durationText = durationMs ? ` für ${formatDuration(durationMs)}` : " dauerhaft";
      await ctx.reply(
        reason
          ? `🔇 ${label} wurde${durationText} stummgeschaltet. Grund: ${reason}`
          : `🔇 ${label} wurde${durationText} stummgeschaltet.`
      );
    } catch (error) {
      console.error("Failed to mute user", error);
      await ctx.reply("Konnte den Nutzer nicht stummschalten.");
    }
  });

  bot.command("unmute", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_restrict_members: true }))) return;

    const payload = extractCommandPayload(ctx);
    const [targetToken] = payload.split(/\s+/).filter(Boolean);
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /unmute <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }

    try {
      await ctx.api.restrictChatMember(admin.chatId, target.userId, UNMUTE_PERMISSIONS);
      const label = formatUserLabel(target.user, target.userId);
      await ctx.reply(`🔊 ${label} kann wieder schreiben.`);
    } catch (error) {
      console.error("Failed to unmute user", error);
      await ctx.reply("Konnte den Nutzer nicht entsperren.");
    }
  });

  bot.command("warn", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const payload = extractCommandPayload(ctx);
    const tokens = payload.split(/\s+/).filter(Boolean);
    const targetToken = tokens.shift();
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /warn <user-id oder @username> [Grund]");
      return;
    }
    const reason = tokens.join(" ").trim();
    const updated = await incrementWarning(
      warningStore,
      admin.chatId,
      target.userId,
      reason,
      ctx.from?.id
    );
    const label = formatUserLabel(target.user, target.userId);
    await ctx.reply(
      reason
        ? `⚠️ ${label} verwarnt. Warnungen: ${updated.count}. Grund: ${reason}`
        : `⚠️ ${label} verwarnt. Warnungen: ${updated.count}.`
    );
  });

  bot.command("unwarn", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const payload = extractCommandPayload(ctx);
    const tokens = payload.split(/\s+/).filter(Boolean);
    const targetToken = tokens.shift();
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /unwarn <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }

    const updated = await decrementWarning(
      warningStore,
      admin.chatId,
      target.userId,
      ctx.from?.id
    );
    const label = formatUserLabel(target.user, target.userId);
    if (!updated || updated.count === 0) {
      await ctx.reply(`✅ ${label} hat jetzt keine Warnungen mehr.`);
      return;
    }
    await ctx.reply(`✅ ${label} hat jetzt ${updated.count} Warnung(en).`);
  });

  bot.command("warnings", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;

    const args = extractCommandArgs(ctx);
    const targetToken = args[0];
    const target = await resolveTargetUser(ctx, targetToken);
    if (!target) {
      await ctx.reply("Nutzung: /warnings <user-id oder @username> oder antworte auf eine Nachricht.");
      return;
    }
    const current = await getWarning(warningStore, admin.chatId, target.userId);
    const label = formatUserLabel(target.user, target.userId);
    if (!current || current.count === 0) {
      await ctx.reply(`ℹ️ ${label} hat keine Warnungen.`);
      return;
    }
    await ctx.reply(
      current.lastReason
        ? `ℹ️ ${label}: ${current.count} Warnung(en). Letzter Grund: ${current.lastReason}`
        : `ℹ️ ${label}: ${current.count} Warnung(en).`
    );
  });

  bot.command("purge", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_delete_messages: true }))) return;

    const args = extractCommandArgs(ctx);
    const rawCount = Number(args[0]);
    if (!Number.isFinite(rawCount) || rawCount <= 0) {
      await ctx.reply("Nutzung: /purge <anzahl>");
      return;
    }
    const count = Math.min(MAX_PURGE, Math.floor(rawCount));
    const baseId = ctx.message?.message_id;
    if (!baseId) {
      await ctx.reply("Konnte die Nachrichten-ID nicht finden.");
      return;
    }

    let deleted = 0;
    for (let i = 0; i < count; i += 1) {
      const messageId = baseId - i;
      if (messageId <= 0) break;
      try {
        await ctx.api.deleteMessage(admin.chatId, messageId);
        deleted += 1;
      } catch (error) {
        // Ignore delete failures
      }
    }

    const suffix = rawCount > MAX_PURGE ? ` (max ${MAX_PURGE})` : "";
    await ctx.reply(`🧹 Gelöscht: ${deleted}${suffix}.`);
  });

  bot.command("pin", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_pin_messages: true }))) return;

    const replyId = ctx.message?.reply_to_message?.message_id;
    if (!replyId) {
      await ctx.reply("Nutzung: /pin als Antwort auf eine Nachricht.");
      return;
    }
    try {
      await ctx.api.pinChatMessage(admin.chatId, replyId);
      await ctx.reply("📌 Nachricht angeheftet.");
    } catch (error) {
      console.error("Failed to pin message", error);
      await ctx.reply("Konnte die Nachricht nicht anheften.");
    }
  });

  bot.command("unpin", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_pin_messages: true }))) return;

    const replyId = ctx.message?.reply_to_message?.message_id;
    if (!replyId) {
      await ctx.reply("Nutzung: /unpin als Antwort auf eine angeheftete Nachricht.");
      return;
    }
    try {
      await ctx.api.unpinChatMessage(admin.chatId, replyId);
      await ctx.reply("✅ Nachricht gelöst.");
    } catch (error) {
      console.error("Failed to unpin message", error);
      await ctx.reply("Konnte die Nachricht nicht lösen.");
    }
  });

  bot.command("lock", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_manage_chat: true }))) return;

    try {
      await ctx.api.setChatPermissions(admin.chatId, LOCK_PERMISSIONS);
      await ctx.reply("🔒 Chat ist jetzt gesperrt (nur Admins können schreiben).");
    } catch (error) {
      console.error("Failed to lock chat", error);
      await ctx.reply("Konnte den Chat nicht sperren.");
    }
  });

  bot.command("unlock", async (ctx) => {
    const admin = await ensureGroupAdmin(ctx);
    if (!admin) return;
    if (!(await ensureBotPermissions(ctx, admin.chatId, { can_manage_chat: true }))) return;

    try {
      await ctx.api.setChatPermissions(admin.chatId, UNLOCK_PERMISSIONS);
      await ctx.reply("🔓 Chat ist wieder offen.");
    } catch (error) {
      console.error("Failed to unlock chat", error);
      await ctx.reply("Konnte den Chat nicht entsperren.");
    }
  });

  bot.command("help", async (ctx) => {
    const lines = [
      "SeiriBot Hilfe",
      "",
      "Moderation (Admins):",
      "/ban /unban /kick",
      "/mute /unmute [10m|2h|1d]",
      "/warn /unwarn /warnings",
      "/purge <anzahl>",
      "/pin /unpin (Antwort)",
      "/lock /unlock",
      "",
      "Federation:",
      "/fedset <federal_chat_id>",
      "/fedadd <chat_id> | /fedremove <chat_id> | /fedlist",
      "/fban /funban /fmute /funmute",
      "/fedinfo",
      "",
      "Konfiguration:",
      "/config (Menü)",
      "/setwelcome /setrules",
      "/allow /deny /unallow /undeny /listallow /listdeny",
      "/delserv on|off"
    ];
    await ctx.reply(lines.join("\n"));
  });
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
