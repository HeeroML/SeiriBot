import type { Context } from "grammy";
import type { ChatMember, ChatPermissions } from "grammy/types";
import type { MyContext } from "../types";

const ADMIN_STATUSES = new Set(["administrator", "creator"]);
const GROUP_CHAT_TYPES = new Set(["group", "supergroup"]);

const PERMISSION_LABELS: Record<string, string> = {
  can_restrict_members: "Mitglieder einschränken",
  can_delete_messages: "Nachrichten löschen",
  can_pin_messages: "Nachrichten anheften",
  can_manage_chat: "Chat verwalten"
};

export type BotPermissionCheck = {
  can_restrict_members?: boolean;
  can_delete_messages?: boolean;
  can_pin_messages?: boolean;
  can_manage_chat?: boolean;
};

export type TargetUser = {
  userId: number;
  user?: {
    username?: string;
    first_name?: string;
  };
};

export function extractCommandPayload(ctx: Context): string {
  const text = ctx.message?.text ?? "";
  const entity = ctx.message?.entities?.find(
    (item) => item.type === "bot_command" && item.offset === 0
  );
  if (!entity) return "";
  return text.slice(entity.length).trim();
}

export function extractCommandArgs(ctx: Context): string[] {
  const payload = extractCommandPayload(ctx);
  if (!payload) return [];
  return payload.split(/\s+/).filter(Boolean);
}

export async function ensureGroupAdmin(
  ctx: MyContext
): Promise<{ chatId: number; chatTitle?: string } | null> {
  if (!ctx.chat || !GROUP_CHAT_TYPES.has(ctx.chat.type)) {
    await ctx.reply("Bitte nutze diesen Befehl in einer Gruppe oder Supergruppe.");
    return null;
  }
  if (!ctx.from) return null;

  let chatTitle: string | undefined;
  try {
    if ("title" in ctx.chat && ctx.chat.title) {
      chatTitle = ctx.chat.title;
    } else {
      const chat = await ctx.api.getChat(ctx.chat.id);
      if ("title" in chat && chat.title) chatTitle = chat.title;
    }
  } catch (error) {
    console.error("Failed to fetch chat info", error);
  }

  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    if (ADMIN_STATUSES.has(member.status)) {
      return { chatId: ctx.chat.id, chatTitle };
    }
  } catch (error) {
    console.error("Failed to check admin status", error);
  }

  await ctx.reply("Nur Admins.");
  return null;
}

function hasPermission(member: ChatMember, key: keyof BotPermissionCheck): boolean {
  if (member.status === "creator") return true;
  if (member.status !== "administrator") return false;
  const admin = member as ChatMember & { [key: string]: boolean | undefined };
  return Boolean(admin[key as string]);
}

export async function ensureBotPermissions(
  ctx: MyContext,
  chatId: number,
  required: BotPermissionCheck
): Promise<boolean> {
  let member: ChatMember | undefined;
  try {
    member = await ctx.api.getChatMember(chatId, ctx.me.id);
  } catch (error) {
    console.error("Failed to fetch bot permissions", error);
    await ctx.reply("Ich konnte meine Adminrechte nicht prüfen.");
    return false;
  }

  const missing = Object.entries(required).filter(
    ([key, needed]) => needed && !hasPermission(member as ChatMember, key as keyof BotPermissionCheck)
  );
  if (missing.length === 0) return true;

  const labels = missing.map(([key]) => PERMISSION_LABELS[key] ?? key).join(", ");
  await ctx.reply(`Mir fehlen Rechte: ${labels}. Bitte Adminrechte vergeben.`);
  return false;
}

export async function resolveTargetUser(
  ctx: MyContext,
  token?: string
): Promise<TargetUser | null> {
  const fromReply = ctx.message?.reply_to_message?.from;
  if (!token) {
    if (fromReply) {
      return { userId: fromReply.id, user: fromReply };
    }
    return null;
  }

  if (token.startsWith("@")) {
    try {
      const chat = await ctx.api.getChat(token);
      if (chat.type !== "private") return null;
      return { userId: chat.id, user: { username: chat.username, first_name: chat.first_name } };
    } catch (error) {
      console.error("Failed to resolve username", error);
      return null;
    }
  }

  const parsed = Number(token);
  if (!Number.isFinite(parsed)) return null;
  return { userId: parsed };
}

export function formatUserLabel(
  user: { username?: string; first_name?: string } | undefined,
  userId: number
): string {
  if (user?.username) return `@${user.username}`;
  if (user?.first_name) return `${user.first_name} (${userId})`;
  return String(userId);
}

export type DurationParseResult = {
  ms?: number;
  error?: string;
};

const DURATION_RE = /^(\d+)([smhd])$/i;
const MAX_DURATION_MS = 366 * 24 * 60 * 60 * 1000;

export function parseDurationMs(token: string | undefined): DurationParseResult {
  if (!token) return { ms: undefined };
  const match = token.match(DURATION_RE);
  if (!match) {
    return { error: "Dauerformat ungültig. Nutze z.B. 10m, 2h oder 1d." };
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Dauer muss größer als 0 sein." };
  }
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === "s"
      ? 1000
      : unit === "m"
        ? 60 * 1000
        : unit === "h"
          ? 60 * 60 * 1000
          : 24 * 60 * 60 * 1000;
  const ms = amount * multiplier;
  if (ms > MAX_DURATION_MS) {
    return { error: "Dauer zu lang. Maximal 366 Tage." };
  }
  return { ms };
}

export function toUntilDate(durationMs: number): number {
  return Math.floor((Date.now() + durationMs) / 1000);
}

export const MUTE_PERMISSIONS: ChatPermissions = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_add_web_page_previews: false,
  can_send_polls: false,
  can_send_other_messages: false
};

export const UNMUTE_PERMISSIONS: ChatPermissions = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_add_web_page_previews: true,
  can_send_polls: true,
  can_send_other_messages: true
};

export const LOCK_PERMISSIONS: ChatPermissions = {
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_add_web_page_previews: false,
  can_send_polls: false,
  can_send_other_messages: false
};

export const UNLOCK_PERMISSIONS: ChatPermissions = {
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_add_web_page_previews: true,
  can_send_polls: true,
  can_send_other_messages: true
};
