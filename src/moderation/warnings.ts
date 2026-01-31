import type { KeyValueStorage, NamespacedStorage } from "../storage/namespaced";
import { createNamespacedStorage } from "../storage/namespaced";

export type WarningRecord = {
  chatId: number;
  userId: number;
  count: number;
  lastReason?: string;
  updatedAt: number;
  updatedBy?: number;
};

export type WarningStore = NamespacedStorage<WarningRecord>;

export function createWarningStore(storage: KeyValueStorage): WarningStore {
  return createNamespacedStorage<WarningRecord>(storage, "warn");
}

function getWarningKey(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}

export async function getWarning(
  store: WarningStore,
  chatId: number,
  userId: number
): Promise<WarningRecord | undefined> {
  return store.read(getWarningKey(chatId, userId));
}

export async function incrementWarning(
  store: WarningStore,
  chatId: number,
  userId: number,
  reason: string | undefined,
  updatedBy?: number
): Promise<WarningRecord> {
  const current: WarningRecord =
    (await getWarning(store, chatId, userId)) ?? {
      chatId,
      userId,
      count: 0,
      updatedAt: 0
    };
  const updated: WarningRecord = {
    ...current,
    count: current.count + 1,
    lastReason: reason?.trim() ? reason.trim() : current.lastReason,
    updatedAt: Date.now(),
    updatedBy
  };
  await store.write(getWarningKey(chatId, userId), updated);
  return updated;
}

export async function decrementWarning(
  store: WarningStore,
  chatId: number,
  userId: number,
  updatedBy?: number
): Promise<WarningRecord | undefined> {
  const current = await getWarning(store, chatId, userId);
  if (!current) return undefined;
  const nextCount = Math.max(0, current.count - 1);
  if (nextCount === 0) {
    await store.delete(getWarningKey(chatId, userId));
    return { ...current, count: 0, updatedAt: Date.now(), updatedBy };
  }
  const updated: WarningRecord = {
    ...current,
    count: nextCount,
    updatedAt: Date.now(),
    updatedBy
  };
  await store.write(getWarningKey(chatId, userId), updated);
  return updated;
}
