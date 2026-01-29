export type GroupConfig = {
  chatId: number;
  welcomeMessage: string;
  rulesMessage: string;
};

export type ConfigStorage = {
  read(key: string): Promise<GroupConfig | undefined>;
  write(key: string, data: GroupConfig): Promise<void>;
};

export const DEFAULT_WELCOME_MESSAGE =
  "✅ Verifiziert! Willkommen in {chat}.\nBitte lies die Regeln.";
export const DEFAULT_RULES_MESSAGE =
  "1. Sei respektvoll.\n2. Kein Spam.\n3. Folge den Mods.";

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
  if (stored) return stored;
  return {
    chatId,
    welcomeMessage: DEFAULT_WELCOME_MESSAGE,
    rulesMessage: DEFAULT_RULES_MESSAGE
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
