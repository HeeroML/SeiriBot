import type { Bot, StorageAdapter } from "grammy";
import type { MyContext, SessionData } from "../types";

export function registerChatMemberHandler(
  bot: Bot<MyContext>,
  sessionStorage: StorageAdapter<SessionData>
): void {
  bot.on("chat_member", async (ctx) => {
    const update = ctx.update.chat_member;
    const newStatus = update.new_chat_member.status;
    const oldStatus = update.old_chat_member.status;

    const joined =
      (oldStatus === "left" || oldStatus === "kicked") &&
      (newStatus === "member" || newStatus === "administrator" || newStatus === "restricted");

    if (!joined) return;

    const chatId = update.chat.id;
    const userId = update.new_chat_member.user.id;
    console.log(`User ${userId} became a member of chat ${chatId}.`);

    const sessionKey = userId.toString();
    const session = await sessionStorage.read(sessionKey);
    if (!session) return;

    if (!session.verifiedChats) {
      session.verifiedChats = {};
    }
    session.verifiedChats[String(chatId)] = Date.now();
    await sessionStorage.write(sessionKey, session);
  });
}
