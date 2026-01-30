import { Bot, MemorySessionStorage, session } from "grammy";
import { chatMembers } from "@grammyjs/chat-members";
import { freeStorage } from "@grammyjs/storage-free";
import type { ChatMember } from "grammy/types";
import { env } from "./env";
import type { MyContext, PendingIndexEntry, SessionData } from "./types";
import type { GroupConfig } from "./config/store";
import { registerJoinRequestHandler } from "./handlers/joinRequest";
import { registerCallbackHandlers } from "./handlers/callbacks";
import { registerChatMemberHandler } from "./handlers/chatMember";
import { registerConfigHandlers } from "./handlers/config";
import { registerTestCaptchaHandlers } from "./handlers/testCaptcha";

const bot = new Bot<MyContext>(env.BOT_TOKEN);

const sessionStorage = new MemorySessionStorage<SessionData>();

bot.use(
  session({
    storage: sessionStorage,
    initial: () => ({ pendingCaptchas: {} }),
    getSessionKey: (ctx) => ctx.from?.id.toString()
  })
);

const chatMemberStorage = new MemorySessionStorage<ChatMember>();
bot.use(chatMembers(chatMemberStorage));

const pendingIndex = new Map<string, PendingIndexEntry>();
const configStorage = freeStorage<GroupConfig>(env.BOT_TOKEN);

registerJoinRequestHandler(bot, { env, pendingIndex });
registerCallbackHandlers(bot, { pendingIndex, configStorage });
registerChatMemberHandler(bot, sessionStorage);
registerConfigHandlers(bot, configStorage);
registerTestCaptchaHandlers(bot);

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Hi! Wenn du eine Beitrittsanfrage gestellt hast, löse bitte das Captcha, das ich dir per DM schicke."
  );
});

bot.catch((error) => {
  console.error("Bot error", error);
});

let sweepRunning = false;
async function sweepExpiredCaptchas(): Promise<void> {
  if (sweepRunning) return;
  sweepRunning = true;

  try {
    const now = Date.now();
    const expired: PendingIndexEntry[] = [];

    for (const entry of pendingIndex.values()) {
      if (entry.expiresAt <= now) {
        expired.push(entry);
      }
    }

    for (const entry of expired) {
      pendingIndex.delete(entry.key);
      try {
        await bot.api.declineChatJoinRequest(entry.chatId, entry.userId);
      } catch (error) {
        console.error("Auto-decline failed", error);
      }

      const sessionData = await sessionStorage.read(entry.sessionKey);
      if (sessionData?.pendingCaptchas?.[entry.key]) {
        delete sessionData.pendingCaptchas[entry.key];
        await sessionStorage.write(entry.sessionKey, sessionData);
      }
    }
  } finally {
    sweepRunning = false;
  }
}

setInterval(() => {
  void sweepExpiredCaptchas();
}, env.SWEEP_INTERVAL_MS);
void sweepExpiredCaptchas();

const allowedUpdates = ["message", "callback_query", "chat_join_request", "chat_member"] as const;

bot.start({
  allowed_updates: [...allowedUpdates],
  onStart: (botInfo) => {
    console.log(`Seiri Bot started as @${botInfo.username}`);
  }
});
