import type { KeyValueStorage } from "../storage/namespaced";

const MANAGED_GROUPS_KEY_PREFIX = "cfg-groups:";
const MANAGED_GROUPS_LIMIT = 50;

export type ManagedGroup = {
  chatId: number;
  title?: string;
  updatedAt: number;
};

type ManagedGroupsState = {
  groups: ManagedGroup[];
};

function isManagedGroupsState(value: unknown): value is ManagedGroupsState {
  if (!value || typeof value !== "object") return false;
  return Array.isArray((value as ManagedGroupsState).groups);
}

function managedGroupsKey(userId: number): string {
  return `${MANAGED_GROUPS_KEY_PREFIX}${userId}`;
}

export async function loadManagedGroups(
  storage: KeyValueStorage,
  userId: number
): Promise<ManagedGroup[]> {
  const data = await storage.read(managedGroupsKey(userId));
  if (!isManagedGroupsState(data)) return [];
  return data.groups
    .filter((group): group is ManagedGroup => Boolean(group) && Number.isFinite(group.chatId))
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function recordManagedGroup(
  storage: KeyValueStorage,
  userId: number,
  chatId: number,
  title?: string
): Promise<void> {
  const groups = await loadManagedGroups(storage, userId);
  const now = Date.now();
  const updated: ManagedGroup = { chatId, title, updatedAt: now };
  const next = [updated, ...groups.filter((group) => group.chatId !== chatId)];
  if (next.length > MANAGED_GROUPS_LIMIT) next.length = MANAGED_GROUPS_LIMIT;
  await storage.write(managedGroupsKey(userId), { groups: next });
}
