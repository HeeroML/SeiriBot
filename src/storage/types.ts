import type { PendingIndexEntry } from "../types";

export type PendingIndexStore = {
  upsert(entry: PendingIndexEntry): Promise<void>;
  delete(key: string): Promise<void>;
  listExpired(now: number, limit?: number): Promise<PendingIndexEntry[]>;
};

export type ConfigLinkRecord = {
  nonce: string;
  chatId: number;
  userId: number;
  expiresAt: number;
};

export type ConfigLinkStore = {
  create(record: ConfigLinkRecord): Promise<void>;
  get(nonce: string): Promise<ConfigLinkRecord | undefined>;
  delete(nonce: string): Promise<void>;
  deleteExpired(now: number): Promise<number>;
};
