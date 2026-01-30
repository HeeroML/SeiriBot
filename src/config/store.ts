export type GroupConfig = {
  chatId: number;
  welcomeMessage: string;
  rulesMessage: string;
  allowlist: number[];
  denylist: number[];
  verifiedUsers: Record<string, number>;
};

export type ConfigStorage = {
  read(key: string): Promise<GroupConfig | undefined>;
  write(key: string, data: GroupConfig): Promise<void>;
};

export const DEFAULT_WELCOME_MESSAGE =
  "✅ Verifiziert! Willkommen in {chat}.\nBitte lies die Regeln.";
export const DEFAULT_RULES_MESSAGE =
  "1. Sei respektvoll.\n2. Kein Spam.\n3. Folge den Mods.";
const DEFAULT_ALLOWLIST: number[] = [];
const DEFAULT_DENYLIST: number[] = [];
const DEFAULT_VERIFIED_USERS: Record<string, number> = {};

export function renderTemplate(template: string, chatTitle?: string): string {
  const safeTitle = chatTitle ?? "the group";
  return template
    .split("{chat}")
    .join(safeTitle)
    .split("{chatTitle}")
    .join(safeTitle);
}

export async function getGroupConfig(
  storage: ConfigStorage,
  chatId: number
): Promise<GroupConfig> {
  const key = chatId.toString();
  const stored = await storage.read(key);
  if (stored) {
    return {
      chatId,
      welcomeMessage: stored.welcomeMessage ?? DEFAULT_WELCOME_MESSAGE,
      rulesMessage: stored.rulesMessage ?? DEFAULT_RULES_MESSAGE,
      allowlist: stored.allowlist ?? DEFAULT_ALLOWLIST,
      denylist: stored.denylist ?? DEFAULT_DENYLIST,
      verifiedUsers: stored.verifiedUsers ?? DEFAULT_VERIFIED_USERS
    };
  }
  return {
    chatId,
    welcomeMessage: DEFAULT_WELCOME_MESSAGE,
    rulesMessage: DEFAULT_RULES_MESSAGE,
    allowlist: DEFAULT_ALLOWLIST,
    denylist: DEFAULT_DENYLIST,
    verifiedUsers: DEFAULT_VERIFIED_USERS
  };
}

export async function setGroupConfig(
  storage: ConfigStorage,
  chatId: number,
  patch: Partial<GroupConfig>
): Promise<GroupConfig> {
  const current = await getGroupConfig(storage, chatId);
  const updated: GroupConfig = {
    ...current,
    ...patch,
    chatId
  };
  await storage.write(chatId.toString(), updated);
  return updated;
}

function normalizeUserList(values: number[]): number[] {
  const unique = new Set(values.filter((value) => Number.isFinite(value)));
  return Array.from(unique).sort((left, right) => left - right);
}

export function pruneVerifiedUsers(
  verifiedUsers: Record<string, number>,
  now: number,
  ttlMs: number
): { pruned: Record<string, number>; removed: boolean } {
  let removed = false;
  const pruned: Record<string, number> = {};
  for (const [userId, timestamp] of Object.entries(verifiedUsers)) {
    if (now - timestamp <= ttlMs) {
      pruned[userId] = timestamp;
    } else {
      removed = true;
    }
  }
  return { pruned, removed };
}

export async function recordVerifiedUser(
  storage: ConfigStorage,
  chatId: number,
  userId: number,
  timestamp: number
): Promise<GroupConfig> {
  const current = await getGroupConfig(storage, chatId);
  const verifiedUsers = {
    ...current.verifiedUsers,
    [userId]: timestamp
  };
  return setGroupConfig(storage, chatId, { verifiedUsers });
}

export async function addAllowlistUser(
  storage: ConfigStorage,
  chatId: number,
  userId: number
): Promise<GroupConfig> {
  const current = await getGroupConfig(storage, chatId);
  const allowlist = normalizeUserList([...current.allowlist, userId]);
  const denylist = current.denylist.filter((entry) => entry !== userId);
  return setGroupConfig(storage, chatId, { allowlist, denylist });
}

export async function removeAllowlistUser(
  storage: ConfigStorage,
  chatId: number,
  userId: number
): Promise<GroupConfig> {
  const current = await getGroupConfig(storage, chatId);
  const allowlist = current.allowlist.filter((entry) => entry !== userId);
  return setGroupConfig(storage, chatId, { allowlist });
}

export async function addDenylistUser(
  storage: ConfigStorage,
  chatId: number,
  userId: number
): Promise<GroupConfig> {
  const current = await getGroupConfig(storage, chatId);
  const denylist = normalizeUserList([...current.denylist, userId]);
  const allowlist = current.allowlist.filter((entry) => entry !== userId);
  return setGroupConfig(storage, chatId, { allowlist, denylist });
}

export async function removeDenylistUser(
  storage: ConfigStorage,
  chatId: number,
  userId: number
): Promise<GroupConfig> {
  const current = await getGroupConfig(storage, chatId);
  const denylist = current.denylist.filter((entry) => entry !== userId);
  return setGroupConfig(storage, chatId, { denylist });
}
