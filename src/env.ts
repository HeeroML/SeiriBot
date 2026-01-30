import * as dotenv from "dotenv";

dotenv.config();

export type Env = {
  BOT_TOKEN: string;
  CAPTCHA_TTL_MS: number;
  MAX_ATTEMPTS: number;
  SWEEP_INTERVAL_MS: number;
  VERIFIED_TTL_MS: number;
};

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("BOT_TOKEN is required. Set it in .env or environment variables.");
}

export const env: Env = {
  BOT_TOKEN,
  CAPTCHA_TTL_MS: toInt(process.env.CAPTCHA_TTL_MS, 10 * 60 * 1000),
  MAX_ATTEMPTS: toInt(process.env.MAX_ATTEMPTS, 2),
  SWEEP_INTERVAL_MS: toInt(process.env.SWEEP_INTERVAL_MS, 60 * 1000),
  VERIFIED_TTL_MS: toInt(process.env.VERIFIED_TTL_MS, 7 * 24 * 60 * 60 * 1000)
};
