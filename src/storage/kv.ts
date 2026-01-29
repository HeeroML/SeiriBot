import type { ChatId } from "../config.ts";

export type CaptchaMode = "pattern" | "turnstile";

export interface PendingCaptcha {
  id: string; // internal id (random)
  mode: CaptchaMode;

  chatId: ChatId;      // the group the user wants to join
  userId: number;      // Telegram user id
  userChatId: number;  // private chat identifier (for messaging the user)

  createdAt: number;   // ms epoch
  expiresAt: number;   // ms epoch

  attempts: number;
  maxAttempts: number;

  // mode-specific
  correctRow?: number; // for pattern captcha
}

export class KvStore {
  private kv: Deno.Kv;

  private constructor(kv: Deno.Kv) {
    this.kv = kv;
  }

  static async open(): Promise<KvStore> {
    const kv = await Deno.openKv();
    return new KvStore(kv);
  }

  close(): void {
    this.kv.close();
  }

  private keyPending(id: string): Deno.KvKey {
    return ["pending", id];
  }

  private keyIndex(chatId: ChatId, userId: number): Deno.KvKey {
    return ["pending_by_user", String(chatId), userId];
  }

  async putPending(pending: PendingCaptcha, kvTtlMs: number): Promise<void> {
    // store both records in one atomic transaction
    const tx = this.kv.atomic();
    tx.set(this.keyPending(pending.id), pending, { expireIn: kvTtlMs });
    tx.set(this.keyIndex(pending.chatId, pending.userId), pending.id, { expireIn: kvTtlMs });
    const res = await tx.commit();
    if (!res.ok) throw new Error("KV transaction failed (putPending)");
  }

  async getPendingById(id: string): Promise<PendingCaptcha | null> {
    const res = await this.kv.get<PendingCaptcha>(this.keyPending(id));
    return res.value ?? null;
  }

  async getPendingIdForUser(chatId: ChatId, userId: number): Promise<string | null> {
    const res = await this.kv.get<string>(this.keyIndex(chatId, userId));
    return res.value ?? null;
  }

  async deletePending(id: string): Promise<void> {
    const pending = await this.getPendingById(id);
    const tx = this.kv.atomic();
    tx.delete(this.keyPending(id));
    if (pending) tx.delete(this.keyIndex(pending.chatId, pending.userId));
    const res = await tx.commit();
    if (!res.ok) throw new Error("KV transaction failed (deletePending)");
  }

  async bumpAttempts(id: string, attempts: number, kvTtlMs: number): Promise<PendingCaptcha | null> {
    const pending = await this.getPendingById(id);
    if (!pending) return null;
    pending.attempts = attempts;
    // refresh TTL so that the sweeper still sees it (we still enforce expiresAt)
    await this.putPending(pending, kvTtlMs);
    return pending;
  }

  async *listPending(): AsyncIterable<PendingCaptcha> {
    for await (const entry of this.kv.list<PendingCaptcha>({ prefix: ["pending"] })) {
      if (entry.value) yield entry.value;
    }
  }
}
