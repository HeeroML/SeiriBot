export type KeyValueStorage = {
  read(key: string): Promise<unknown>;
  write(key: string, data: unknown): Promise<void>;
  delete(key: string): Promise<void>;
};

export type NamespacedStorage<T> = {
  read(key: string): Promise<T | undefined>;
  write(key: string, data: T): Promise<void>;
  delete(key: string): Promise<void>;
};

function normalizePrefix(prefix: string): string {
  if (prefix.endsWith(":")) return prefix;
  return `${prefix}:`;
}

export function createNamespacedStorage<T>(
  storage: KeyValueStorage,
  prefix: string
): NamespacedStorage<T> {
  const safePrefix = normalizePrefix(prefix);
  return {
    async read(key: string): Promise<T | undefined> {
      const value = await storage.read(`${safePrefix}${key}`);
      return value as T | undefined;
    },
    async write(key: string, data: T): Promise<void> {
      await storage.write(`${safePrefix}${key}`, data as unknown);
    },
    async delete(key: string): Promise<void> {
      await storage.delete(`${safePrefix}${key}`);
    }
  };
}
