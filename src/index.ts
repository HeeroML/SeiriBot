import { env } from "./env";
import { allowedUpdates, createBot } from "./bot";
import { createStorage } from "./storage/psql";
import { createFederationStores } from "./federation/store";
import { createWarningStore } from "./moderation/warnings";
import { sweepExpiredCaptchas } from "./sweep";

async function main(): Promise<void> {
  const storage = await createStorage();
  const federationStores = createFederationStores(storage.metaStorage);
  const warningStore = createWarningStore(storage.metaStorage);
  const webAppUrl = env.WEBAPP_URL?.trim();
  const webApp =
    webAppUrl && webAppUrl.length > 0
      ? {
          url: webAppUrl,
          linkStore: storage.configLinkStore,
          linkTtlMs: env.CONFIG_LINK_TTL_MS
        }
      : undefined;

  const bot = createBot({
    env,
    sessionStorage: storage.sessionStorage,
    chatMemberStorage: storage.chatMemberStorage,
    pendingIndexStore: storage.pendingIndexStore,
    configStorage: storage.configStorage,
    metaStorage: storage.metaStorage,
    federationStores,
    warningStore,
    webApp
  });

  setInterval(() => {
    void sweepExpiredCaptchas(bot, storage.sessionStorage, storage.pendingIndexStore);
  }, env.SWEEP_INTERVAL_MS);
  void sweepExpiredCaptchas(bot, storage.sessionStorage, storage.pendingIndexStore);

  bot.start({
    allowed_updates: [...allowedUpdates],
    onStart: (botInfo) => {
      console.log(`Seiri Bot started as @${botInfo.username}`);
    }
  });
}

void main();
