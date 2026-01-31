import { Client, neon, neonConfig } from "@neondatabase/serverless";
import { PsqlAdapter } from "@grammyjs/storage-psql";
import type { ChatMember } from "grammy/types";
import type { StorageAdapter } from "grammy";
import type { SessionData, PendingIndexEntry } from "../types";
import type { ConfigStorage } from "../config/store";
import type { KeyValueStorage } from "./namespaced";
import type { ConfigLinkRecord, ConfigLinkStore, PendingIndexStore } from "./types";
import { env } from "../env";

let clientPromise: Promise<Client> | null = null;
let sql: ReturnType<typeof neon> | null = null;
let schemaReady = false;

if (typeof WebSocket !== "undefined") {
  neonConfig.webSocketConstructor = WebSocket;
}

async function getClient(): Promise<Client> {
  if (!clientPromise) {
    const client = new Client({ connectionString: env.DATABASE_URL });
    clientPromise = client.connect().then(() => client);
  }
  return clientPromise;
}

function getSql(): ReturnType<typeof neon> {
  if (!sql) {
    sql = neon(env.DATABASE_URL);
  }
  return sql;
}

async function ensureSchema(): Promise<void> {
  if (schemaReady) return;
  const db = await getClient();
  await db.query(`
    CREATE TABLE IF NOT EXISTS bot_pending_index (
      entry_key TEXT PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      user_chat_id BIGINT NOT NULL,
      expires_at BIGINT NOT NULL,
      session_key TEXT NOT NULL
    );
  `);
  await db.query(
    "CREATE INDEX IF NOT EXISTS bot_pending_index_expires ON bot_pending_index (expires_at);"
  );
  await db.query(`
    CREATE TABLE IF NOT EXISTS bot_config_links (
      nonce TEXT PRIMARY KEY,
      chat_id BIGINT NOT NULL,
      user_id BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    );
  `);
  await db.query(
    "CREATE INDEX IF NOT EXISTS bot_config_links_expires ON bot_config_links (expires_at);"
  );
  schemaReady = true;
}

function rowToPendingIndex(row: Record<string, unknown>): PendingIndexEntry {
  return {
    key: String(row.entry_key),
    chatId: Number(row.chat_id),
    userId: Number(row.user_id),
    userChatId: Number(row.user_chat_id),
    expiresAt: Number(row.expires_at),
    sessionKey: String(row.session_key)
  };
}

function rowToConfigLink(row: Record<string, unknown>): ConfigLinkRecord {
  return {
    nonce: String(row.nonce),
    chatId: Number(row.chat_id),
    userId: Number(row.user_id),
    expiresAt: Number(row.expires_at)
  };
}

function normalizeRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === "object" && Array.isArray((result as { rows?: unknown }).rows)) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

export type StorageBundle = {
  sessionStorage: StorageAdapter<SessionData>;
  chatMemberStorage: StorageAdapter<ChatMember>;
  configStorage: ConfigStorage;
  metaStorage: KeyValueStorage;
  pendingIndexStore: PendingIndexStore;
  configLinkStore: ConfigLinkStore;
};

export function createPendingIndexStore(): PendingIndexStore {
  const dbPromise = getClient();
  return {
    async upsert(entry: PendingIndexEntry): Promise<void> {
      const db = await dbPromise;
      await db.query(
        `
        INSERT INTO bot_pending_index (entry_key, chat_id, user_id, user_chat_id, expires_at, session_key)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (entry_key)
        DO UPDATE SET chat_id = EXCLUDED.chat_id,
          user_id = EXCLUDED.user_id,
          user_chat_id = EXCLUDED.user_chat_id,
          expires_at = EXCLUDED.expires_at,
          session_key = EXCLUDED.session_key
        `,
        [
          entry.key,
          entry.chatId,
          entry.userId,
          entry.userChatId,
          entry.expiresAt,
          entry.sessionKey
        ]
      );
    },
    async delete(key: string): Promise<void> {
      const db = await dbPromise;
      await db.query("DELETE FROM bot_pending_index WHERE entry_key = $1", [key]);
    },
    async listExpired(now: number, limit = 200): Promise<PendingIndexEntry[]> {
      const db = await dbPromise;
      const result = await db.query(
        `
        SELECT entry_key, chat_id, user_id, user_chat_id, expires_at, session_key
        FROM bot_pending_index
        WHERE expires_at <= $1
        ORDER BY expires_at ASC
        LIMIT $2
        `,
        [now, limit]
      );
      return result.rows.map((row) => rowToPendingIndex(row as Record<string, unknown>));
    }
  };
}

export function createConfigLinkStore(): ConfigLinkStore {
  const dbPromise = getClient();
  const sqlClient = getSql();
  return {
    async create(record: ConfigLinkRecord): Promise<void> {
      const db = await dbPromise;
      await db.query(
        `
        INSERT INTO bot_config_links (nonce, chat_id, user_id, expires_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (nonce)
        DO UPDATE SET chat_id = EXCLUDED.chat_id,
          user_id = EXCLUDED.user_id,
          expires_at = EXCLUDED.expires_at
        `,
        [record.nonce, record.chatId, record.userId, record.expiresAt]
      );
    },
    async get(nonce: string): Promise<ConfigLinkRecord | undefined> {
      const result = await sqlClient`
        SELECT nonce, chat_id, user_id, expires_at
        FROM bot_config_links
        WHERE nonce = ${nonce}
        LIMIT 1
      `;
      const rows = normalizeRows<Record<string, unknown>>(result);
      if (!rows.length) return undefined;
      return rowToConfigLink(rows[0]);
    },
    async delete(nonce: string): Promise<void> {
      const db = await dbPromise;
      await db.query("DELETE FROM bot_config_links WHERE nonce = $1", [nonce]);
    },
    async deleteExpired(now: number): Promise<number> {
      const db = await dbPromise;
      const result = await db.query("DELETE FROM bot_config_links WHERE expires_at <= $1", [
        now
      ]);
      return result.rowCount ?? 0;
    }
  };
}

export async function createStorage(): Promise<StorageBundle> {
  await ensureSchema();
  const db = await getClient();
  const sessionStorage = (await PsqlAdapter.create({
    tableName: "bot_sessions",
    client: db
  })) as StorageAdapter<SessionData>;
  const chatMemberStorage = (await PsqlAdapter.create({
    tableName: "bot_chat_members",
    client: db
  })) as StorageAdapter<ChatMember>;
  const configStorage = (await PsqlAdapter.create({
    tableName: "bot_config",
    client: db
  })) as ConfigStorage;
  const metaStorage = (await PsqlAdapter.create({
    tableName: "bot_meta",
    client: db
  })) as KeyValueStorage;
  return {
    sessionStorage,
    chatMemberStorage,
    configStorage,
    metaStorage,
    pendingIndexStore: createPendingIndexStore(),
    configLinkStore: createConfigLinkStore()
  };
}
