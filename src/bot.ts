import { Bot, session } from "grammy";
import { chatMembers } from "@grammyjs/chat-members";
import type { ChatMember } from "grammy/types";
import type { StorageAdapter } from "grammy";
import type { Env } from "./env";
import type { MyContext, SessionData } from "./types";
import type { ConfigStorage } from "./config/store";
import type { KeyValueStorage } from "./storage/namespaced";
import type { PendingIndexStore, ConfigLinkStore } from "./storage/types";
import type { FederationStores } from "./federation/store";
import type { WarningStore } from "./moderation/warnings";
import { registerJoinRequestHandler } from "./handlers/joinRequest";
import { registerCallbackHandlers } from "./handlers/callbacks";
import { registerChatMemberHandler } from "./handlers/chatMember";
import { registerConfigHandlers } from "./handlers/config";
import { registerTestCaptchaHandlers } from "./handlers/testCaptcha";
import { registerModerationHandlers } from "./handlers/moderation";
import { registerFederationHandlers } from "./handlers/federation";
import { registerServiceMessageHandler } from "./handlers/serviceMessages";

export const allowedUpdates = [
  "message",
  "callback_query",
  "chat_join_request",
  "chat_member"
] as const;

export type WebAppConfig = {
  url: string;
  linkStore: ConfigLinkStore;
  linkTtlMs: number;
};

export type BotDeps = {
  env: Env;
  sessionStorage: StorageAdapter<SessionData>;
  chatMemberStorage: StorageAdapter<ChatMember>;
  pendingIndexStore: PendingIndexStore;
  configStorage: ConfigStorage;
  metaStorage: KeyValueStorage;
  federationStores: FederationStores;
  warningStore: WarningStore;
  webApp?: WebAppConfig;
};

export function createBot(deps: BotDeps): Bot<MyContext> {
  const bot = new Bot<MyContext>(deps.env.BOT_TOKEN);

  bot.use(
    session({
      storage: deps.sessionStorage,
      initial: () => ({ pendingCaptchas: {} }),
      getSessionKey: (ctx) => ctx.from?.id.toString()
    })
  );

  bot.use(chatMembers(deps.chatMemberStorage));

  registerJoinRequestHandler(bot, {
    env: deps.env,
    pendingIndex: deps.pendingIndexStore,
    configStorage: deps.configStorage,
    federationStores: deps.federationStores
  });
  registerCallbackHandlers(bot, {
    pendingIndex: deps.pendingIndexStore,
    configStorage: deps.configStorage
  });
  registerChatMemberHandler(bot, deps.sessionStorage);
  registerConfigHandlers(bot, {
    configStorage: deps.configStorage,
    metaStorage: deps.metaStorage,
    webApp: deps.webApp
  });
  registerTestCaptchaHandlers(bot);
  registerModerationHandlers(bot, deps.warningStore);
  registerFederationHandlers(bot, deps.federationStores);
  registerServiceMessageHandler(bot, deps.configStorage);

  bot.command("start", async (ctx) => {
    await ctx.reply(
      "Hi! Wenn du eine Beitrittsanfrage gestellt hast, loese bitte das Captcha, das ich dir per DM schicke. Konfiguration mit /config in der Gruppe."
    );
  });

  bot.catch((error) => {
    console.error("Bot error", error);
  });

  return bot;
}
