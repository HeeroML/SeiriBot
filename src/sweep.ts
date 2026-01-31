import type { Bot, StorageAdapter } from "grammy";
import type { MyContext, SessionData } from "./types";
import type { PendingIndexStore } from "./storage/types";

let sweepRunning = false;

export async function sweepExpiredCaptchas(
  bot: Bot<MyContext>,
  sessionStorage: StorageAdapter<SessionData>,
  pendingIndexStore: PendingIndexStore
): Promise<number> {
  if (sweepRunning) return 0;
  sweepRunning = true;
  try {
    const now = Date.now();
    const expired = await pendingIndexStore.listExpired(now);
    let handled = 0;

    for (const entry of expired) {
      await pendingIndexStore.delete(entry.key);
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
      handled += 1;
    }
    return handled;
  } finally {
    sweepRunning = false;
  }
}
