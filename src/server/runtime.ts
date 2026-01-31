import type { Bot } from "grammy";
import type { MyContext } from "../types";
import { env } from "../env";
import { createBot } from "../bot";
import { createStorage, type StorageBundle } from "../storage/psql";
import { createFederationStores } from "../federation/store";
import { createWarningStore } from "../moderation/warnings";

let storagePromise: Promise<StorageBundle> | null = null;
let botPromise: Promise<Bot<MyContext>> | null = null;

export async function getStorage(): Promise<StorageBundle> {
  if (!storagePromise) {
    storagePromise = createStorage();
  }
  return storagePromise;
}

export async function getBot(): Promise<Bot<MyContext>> {
  if (!botPromise) {
    botPromise = (async () => {
      const storage = await getStorage();
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
      return createBot({
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
    })();
  }
  return botPromise;
}
