import { webhookCallback } from "grammy";
import { allowedUpdates } from "../../../src/bot";
import { getBot } from "../../../src/server/runtime";
import { env } from "../../../src/env";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

let handlerPromise: Promise<(req: Request) => Promise<Response>> | null = null;
let webhookEnsured = false;

async function getHandler(): Promise<(req: Request) => Promise<Response>> {
  if (!handlerPromise) {
    handlerPromise = getBot().then((bot) => webhookCallback(bot, "std/http"));
  }
  return handlerPromise;
}

async function ensureWebhook(): Promise<void> {
  if (webhookEnsured) return;
  if (process.env.VERCEL_ENV !== "production") return;
  const baseUrl = env.WEBHOOK_URL;
  if (!baseUrl) {
    console.error("WEBHOOK_URL missing; webhook not set.");
    return;
  }
  const bot = await getBot();
  const target = `${baseUrl.replace(/\/$/, "")}/api/telegram`;
  try {
    const info = await bot.api.getWebhookInfo();
    if (info.url !== target) {
      await bot.api.setWebhook(target, { allowed_updates: [...allowedUpdates] });
    }
    webhookEnsured = true;
  } catch (error) {
    console.error("Failed to ensure webhook", error);
  }
}

export async function POST(req: Request): Promise<Response> {
  await ensureWebhook();
  const handler = await getHandler();
  return handler(req);
}
