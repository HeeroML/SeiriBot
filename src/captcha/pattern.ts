import { randomBytes } from "node:crypto";

const EMOJI_POOL = [
  "🍎",
  "🍌",
  "🍇",
  "🍒",
  "🍉",
  "🍋",
  "🥝",
  "🍑",
  "🍍",
  "🥥",
  "🥕",
  "🌽",
  "🧀",
  "🍪",
  "🍩",
  "🍫",
  "⭐️",
  "⚡️",
  "🔥",
  "🌊"
];

export const ROW_COUNT = 4;
export const ROW_LENGTH = 8;

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickDistinctEmojis(count: number, exclude: Set<string> = new Set()): string[] {
  const available = EMOJI_POOL.filter((emoji) => !exclude.has(emoji));
  if (count > available.length) {
    throw new Error("Not enough emojis to build a captcha pattern.");
  }
  for (let i = available.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, count);
}

export function generateNonce(bytes = 4): string {
  return randomBytes(bytes).toString("hex");
}

export type PatternCaptcha = {
  rows: string[][];
  brokenRow: number;
  text: string;
};

export function generatePatternCaptcha(): PatternCaptcha {
  const rows: string[][] = [];
  const patterns: string[][] = [];

  for (let i = 0; i < ROW_COUNT; i += 1) {
    const patternLength = randomInt(2, 4);
    const pattern = pickDistinctEmojis(patternLength);
    const row = Array.from({ length: ROW_LENGTH }, (_, index) => pattern[index % patternLength]);
    rows.push(row);
    patterns.push(pattern);
  }

  const brokenRowIndex = randomInt(0, ROW_COUNT - 1);
  const brokenElementIndex = randomInt(0, ROW_LENGTH - 1);
  const replacement = pickDistinctEmojis(1, new Set(patterns[brokenRowIndex]))[0];
  rows[brokenRowIndex][brokenElementIndex] = replacement;

  const text = rows.map((row, index) => `${index + 1}) ${row.join(" ")}`).join("\n");

  return {
    rows,
    brokenRow: brokenRowIndex + 1,
    text
  };
}
