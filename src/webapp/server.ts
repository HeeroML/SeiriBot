import type { Bot } from "grammy";
import type { MyContext } from "../types";
import { env } from "../env";
import { getBot, getStorage } from "../server/runtime";
import type { StorageBundle } from "../storage/psql";
import { loadManagedGroups } from "../config/managedGroups";
import { validateInitData, type WebAppUser } from "./validate";

const ADMIN_STATUSES = new Set(["administrator", "creator"]);
const CONFIG_CHAT_TYPES = new Set(["group", "supergroup", "channel"]);

export type WebAppAuthPayload = {
  initData?: string;
  chatId?: number;
  nonce?: string;
};

type WebAppUserResult =
  | { ok: true; user: WebAppUser }
  | { ok: false; response: Response };

type WebAppAdminResult =
  | {
      ok: true;
      bot: Bot<MyContext>;
      storage: StorageBundle;
      user: WebAppUser;
      chatId: number;
      chatTitle?: string;
    }
  | { ok: false; response: Response };

function jsonError(status: number, error: string): Response {
  return Response.json({ ok: false, error }, { status });
}

function parseChatId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

export async function requireWebAppUser(payload: {
  initData?: string;
}): Promise<WebAppUserResult> {
  const initData = payload.initData ?? "";
  const parsed = validateInitData(initData, env.BOT_TOKEN);
  if (!parsed?.user) {
    return { ok: false, response: jsonError(401, "Ungueltige initData.") };
  }
  return { ok: true, user: parsed.user };
}

export async function requireWebAppAdmin(
  payload: WebAppAuthPayload
): Promise<WebAppAdminResult> {
  const userResult = await requireWebAppUser(payload);
  if (!userResult.ok) return userResult;

  const chatId = parseChatId(payload.chatId);
  if (!chatId) {
    return { ok: false, response: jsonError(400, "chatId fehlt.") };
  }

  const bot = await getBot();
  const storage = await getStorage();
  const userId = userResult.user.id;

  if (payload.nonce) {
    const link = await storage.configLinkStore.get(payload.nonce);
    if (!link) {
      return { ok: false, response: jsonError(403, "Link ungueltig oder abgelaufen.") };
    }
    if (link.expiresAt <= Date.now()) {
      return { ok: false, response: jsonError(403, "Link abgelaufen.") };
    }
    if (link.chatId !== chatId || link.userId !== userId) {
      return { ok: false, response: jsonError(403, "Link passt nicht.") };
    }
  }

  let chatTitle: string | undefined;
  let chatType: string | undefined;
  try {
    const chat = await bot.api.getChat(chatId);
    chatType = chat.type;
    if ("title" in chat && chat.title) chatTitle = chat.title;
  } catch (error) {
    console.error("Failed to fetch chat info", error);
    return { ok: false, response: jsonError(404, "Chat nicht gefunden.") };
  }

  if (!chatType || !CONFIG_CHAT_TYPES.has(chatType)) {
    return { ok: false, response: jsonError(400, "Nur Gruppen, Supergruppen oder Kanaele.") };
  }

  try {
    const member = await bot.api.getChatMember(chatId, userId);
    if (!ADMIN_STATUSES.has(member.status)) {
      return { ok: false, response: jsonError(403, "Nur Admins.") };
    }
  } catch (error) {
    console.error("Failed to check admin status", error);
    return { ok: false, response: jsonError(500, "Admin-Check fehlgeschlagen.") };
  }

  return {
    ok: true,
    bot,
    storage,
    user: userResult.user,
    chatId,
    chatTitle
  };
}

export async function getManagedGroupsForUser(
  userId: number
): Promise<ReturnType<typeof loadManagedGroups>> {
  const storage = await getStorage();
  return loadManagedGroups(storage.metaStorage, userId);
}
