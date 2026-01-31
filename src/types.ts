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
  cooldownUntil?: number;
  status?: "pending" | "processing";
};

export type SessionData = {
  pendingCaptchas: Record<string, PendingCaptcha>;
  verifiedChats?: Record<string, number>;
  configPending?: ConfigPendingAction;
  testCaptcha?: {
    question: string;
    options: CaptchaOption[];
    correctOption: number;
    nonce: string;
    createdAt: number;
    textMode?: boolean;
  };
};

export type ConfigPendingAction = {
  action: "setWelcome" | "setRules" | "addAllow" | "addDeny" | "removeAllow" | "removeDeny";
  chatId: number;
  chatTitle?: string;
  originChatId: number;
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
