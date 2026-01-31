import type { KeyValueStorage, NamespacedStorage } from "../storage/namespaced";
import { createNamespacedStorage } from "../storage/namespaced";

export type FederationRecord = {
  fedChatId: number;
  linkedChats: number[];
  bannedUsers: number[];
};

export type FederationLink = {
  fedChatId: number;
};

export type FederationStores = {
  federations: NamespacedStorage<FederationRecord>;
  links: NamespacedStorage<FederationLink>;
};

export function createFederationStores(storage: KeyValueStorage): FederationStores {
  return {
    federations: createNamespacedStorage<FederationRecord>(storage, "fed"),
    links: createNamespacedStorage<FederationLink>(storage, "fed-link")
  };
}

function normalizeNumberList(values: number[]): number[] {
  const unique = new Set(values.filter((value) => Number.isFinite(value)));
  return Array.from(unique).sort((left, right) => left - right);
}

export async function getFederation(
  stores: FederationStores,
  fedChatId: number
): Promise<FederationRecord | undefined> {
  return stores.federations.read(fedChatId.toString());
}

export async function ensureFederation(
  stores: FederationStores,
  fedChatId: number
): Promise<FederationRecord> {
  const existing = await getFederation(stores, fedChatId);
  if (existing) return existing;
  const record: FederationRecord = {
    fedChatId,
    linkedChats: [],
    bannedUsers: []
  };
  await stores.federations.write(fedChatId.toString(), record);
  return record;
}

export async function setFederationLink(
  stores: FederationStores,
  chatId: number,
  fedChatId: number
): Promise<void> {
  await stores.links.write(chatId.toString(), { fedChatId });
}

export async function clearFederationLink(
  stores: FederationStores,
  chatId: number
): Promise<void> {
  await stores.links.delete(chatId.toString());
}

export async function getFederationLink(
  stores: FederationStores,
  chatId: number
): Promise<FederationLink | undefined> {
  return stores.links.read(chatId.toString());
}

export async function getFederationForChat(
  stores: FederationStores,
  chatId: number
): Promise<FederationRecord | undefined> {
  const direct = await getFederation(stores, chatId);
  if (direct) return direct;
  const link = await getFederationLink(stores, chatId);
  if (!link) return undefined;
  return getFederation(stores, link.fedChatId);
}

export async function addFederationChat(
  stores: FederationStores,
  fedChatId: number,
  chatId: number
): Promise<FederationRecord> {
  const record = await ensureFederation(stores, fedChatId);
  const linkedChats = normalizeNumberList([...record.linkedChats, chatId]);
  const updated: FederationRecord = { ...record, linkedChats };
  await stores.federations.write(fedChatId.toString(), updated);
  await setFederationLink(stores, chatId, fedChatId);
  return updated;
}

export async function removeFederationChat(
  stores: FederationStores,
  fedChatId: number,
  chatId: number
): Promise<FederationRecord> {
  const record = await ensureFederation(stores, fedChatId);
  const linkedChats = record.linkedChats.filter((entry) => entry !== chatId);
  const updated: FederationRecord = { ...record, linkedChats };
  await stores.federations.write(fedChatId.toString(), updated);
  await clearFederationLink(stores, chatId);
  return updated;
}

export async function addFederationBan(
  stores: FederationStores,
  fedChatId: number,
  userId: number
): Promise<FederationRecord> {
  const record = await ensureFederation(stores, fedChatId);
  const bannedUsers = normalizeNumberList([...record.bannedUsers, userId]);
  const updated: FederationRecord = { ...record, bannedUsers };
  await stores.federations.write(fedChatId.toString(), updated);
  return updated;
}

export async function removeFederationBan(
  stores: FederationStores,
  fedChatId: number,
  userId: number
): Promise<FederationRecord> {
  const record = await ensureFederation(stores, fedChatId);
  const bannedUsers = record.bannedUsers.filter((entry) => entry !== userId);
  const updated: FederationRecord = { ...record, bannedUsers };
  await stores.federations.write(fedChatId.toString(), updated);
  return updated;
}
