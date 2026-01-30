import type { Context, SessionFlavor } from "grammy";
import type { ChatMembersFlavor } from "@grammyjs/chat-members";
import type { CaptchaOption } from "./captcha/pattern";

export type PendingCaptcha = {
  chatId: number;
  userId: number;
  userChatId: number;
  question: string;
  options: CaptchaOption[];
  correctOption: number;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  expiresAt: number;
  nonce: string;
  lastCaptchaMessageId?: number;
  textMode?: boolean;
  banConfirmAt?: number;
  cooldownUntil?: number;
  status?: "pending" | "processing";
};

export type SessionData = {
  pendingCaptchas: Record<string, PendingCaptcha>;
  verifiedChats?: Record<string, number>;
  activeConfigChatId?: number;
  managedChats?: Record<string, { title?: string; lastSeen: number }>;
  configThreads?: Record<string, number>;
  testCaptcha?: {
    question: string;
    options: CaptchaOption[];
    correctOption: number;
    nonce: string;
    createdAt: number;
    textMode?: boolean;
    banConfirmAt?: number;
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
