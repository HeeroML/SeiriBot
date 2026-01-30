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

registerJoinRequestHandler(bot, { env, pendingIndex, configStorage });
registerCallbackHandlers(bot, { pendingIndex, configStorage });
registerChatMemberHandler(bot, sessionStorage);
registerConfigHandlers(bot, configStorage);
registerTestCaptchaHandlers(bot);

bot.command("start", async (ctx) => {
  if (ctx.chat?.type !== "private") {
    await ctx.reply(
      "Hi! Wenn du eine Beitrittsanfrage gestellt hast, löse bitte das Captcha, das ich dir per DM schicke."
    );
    return;
  }

  const threadId = getMessageThreadId(ctx);
  const topicsEnabled = hasPrivateTopicsEnabled(ctx);
  const managedChats = ctx.session.managedChats ?? {};
  const configThreads = ctx.session.configThreads ?? {};
  const threadsByChat: Record<string, number[]> = {};

  Object.entries(configThreads).forEach(([threadKey, chatId]) => {
    if (!threadsByChat[String(chatId)]) threadsByChat[String(chatId)] = [];
    const threadNumber = Number(threadKey);
    if (Number.isFinite(threadNumber)) threadsByChat[String(chatId)].push(threadNumber);
  });

  const lines: string[] = [
    "Hi! Hier ist deine Uebersicht.",
    ""
  ];

  if (threadId) {
    const mappedChatId = configThreads[String(threadId)];
    if (mappedChatId) {
      const entry = managedChats[String(mappedChatId)];
      const title = entry?.title ?? String(mappedChatId);
      lines.push(`Dieses Thema ist verbunden mit: ${title} (${mappedChatId}).`);
    } else {
      lines.push("Dieses Thema ist noch nicht verbunden. Nutze /config <chat-id> hier.");
    }
    lines.push("");
  }

  const allChatIds = new Set([
    ...Object.keys(managedChats),
    ...Object.values(configThreads).map((id) => String(id))
  ]);

  if (!threadId && topicsEnabled && allChatIds.size > 0) {
    const createdTopics: number[] = [];
    for (const chatId of allChatIds) {
      const existingThread = findThreadIdForChat(configThreads, Number(chatId));
      if (existingThread) continue;
      const title = managedChats[chatId]?.title ?? chatId;
      const createdThreadId = await createPrivateTopic(ctx, String(title));
      if (createdThreadId) {
        ctx.session.configThreads = ctx.session.configThreads ?? {};
        ctx.session.configThreads[String(createdThreadId)] = Number(chatId);
        createdTopics.push(createdThreadId);
        await ctx.api.sendMessage(
          ctx.chat.id,
          `Dieses Thema ist verbunden mit ${title} (${chatId}).`,
          { message_thread_id: createdThreadId }
        );
      }
    }
    if (createdTopics.length > 0) {
      lines.push(`Neue Themen erstellt: ${createdTopics.join(", ")}.`);
      lines.push("");
    }
  }

  if (allChatIds.size === 0) {
    lines.push("Keine Gruppen gespeichert. Nutze /config in deiner Gruppe.");
  } else {
    lines.push("Deine Gruppen:");
    Array.from(allChatIds)
      .sort()
      .forEach((chatId) => {
        const entry = managedChats[chatId];
        const title = entry?.title ?? chatId;
        const topics = threadsByChat[chatId];
        const topicLabel = topics?.length ? ` | Themen: ${topics.join(", ")}` : "";
        lines.push(`- ${title} (${chatId})${topicLabel}`);
      });
    lines.push("");
    lines.push("Nutze /config <chat-id> in einem Thema, um es zu verknuepfen.");
  }

  await ctx.reply(lines.join("\n"));
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

function getMessageThreadId(ctx: MyContext): number | undefined {
  const message = ctx.message as { message_thread_id?: number } | undefined;
  const threadId = message?.message_thread_id;
  return typeof threadId === "number" ? threadId : undefined;
}

function findThreadIdForChat(
  configThreads: Record<string, number>,
  chatId: number
): number | undefined {
  for (const [threadKey, mappedChatId] of Object.entries(configThreads)) {
    if (mappedChatId === chatId) {
      const threadId = Number(threadKey);
      return Number.isFinite(threadId) ? threadId : undefined;
    }
  }
  return undefined;
}

function hasPrivateTopicsEnabled(ctx: MyContext): boolean {
  const user = ctx.from as { has_topics_enabled?: boolean } | undefined;
  return Boolean(user?.has_topics_enabled);
}

async function createPrivateTopic(ctx: MyContext, title: string): Promise<number | undefined> {
  if (!ctx.chat) return undefined;
  try {
    const topic = await ctx.api.createForumTopic(ctx.chat.id, title);
    return topic.message_thread_id;
  } catch (error) {
    console.error("Failed to create private topic", error);
    return undefined;
  }
}
