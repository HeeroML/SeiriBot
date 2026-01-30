import type { Context, SessionFlavor } from "grammy";
import type { ChatMembersFlavor } from "@grammyjs/chat-members";

export type PendingCaptcha = {
  chatId: number;
  userId: number;
  userChatId: number;
  correctRow: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  expiresAt: number;
  nonce: string;
  lastCaptchaMessageId?: number;
  status?: "pending" | "processing";
};

export type SessionData = {
  pendingCaptchas: Record<string, PendingCaptcha>;
  verifiedChats?: Record<string, number>;
  activeConfigChatId?: number;
  testCaptcha?: {
    correctRow: number;
    nonce: string;
    createdAt: number;
  };
};

export type PendingIndexEntry = {
  key: string;
  chatId: number;
  userId: number;
  userChatId: number;
  expiresAt: number;
  sessionKey: string;
};

export type MyContext = Context & SessionFlavor<SessionData> & ChatMembersFlavor;

export function makePendingKey(chatId: number, userId: number): string {
  return `${chatId}:${userId}`;
}
