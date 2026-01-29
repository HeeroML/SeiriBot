import { randomId, randomInt } from "../util/random.ts";

const EMOJI_POOL = [
  "🍎", "🍌", "🍇", "🍓", "🍒", "🍍", "🥝", "🍋", "🍉", "🍑", "🍐",
  "🥕", "🌽", "🥔", "🍄", "🌶️", "🧄", "🧅", "🥑",
  "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
  "⭐", "🌙", "⚡", "🔥", "💧", "❄️", "🌈", "☘️", "🍀",
  "🔺", "🔷", "⬛", "⬜", "🟩", "🟦", "🟨", "🟪",
];

export type PatternChallenge = {
  id: string;
  message: string;
  correctRow: number; // 1..4
};

/**
 * Create a "repeating pattern" captcha:
 * - 4 lines of emoji sequences
 * - Exactly one line has a single mistake (one element replaced)
 */
export function createPatternChallenge(params?: {
  rows?: number;
  length?: number;
  minPatternSize?: number;
  maxPatternSize?: number;
}): PatternChallenge {
  const rows = params?.rows ?? 4;
  const length = params?.length ?? 12;
  const minPatternSize = params?.minPatternSize ?? 2;
  const maxPatternSize = params?.maxPatternSize ?? 4;

  if (rows < 2) throw new Error("rows must be >= 2");
  if (length < 6) throw new Error("length must be >= 6");

  const rowData: string[] = [];
  const rowPatterns: string[][] = [];

  // Build each row as a clean repeating pattern.
  for (let r = 0; r < rows; r++) {
    const patternSize = randomInt(minPatternSize, maxPatternSize + 1);
    const symbols = sampleUnique(EMOJI_POOL, patternSize);
    rowPatterns.push(symbols);

    const seq: string[] = [];
    for (let i = 0; i < length; i++) {
      seq.push(symbols[i % patternSize]);
    }
    rowData.push(seq.join(""));
  }

  // Choose which row to corrupt.
  const brokenIndex = randomInt(0, rows);
  const brokenPattern = rowPatterns[brokenIndex];

  // NOTE: Array.from(string) splits by code points; emoji can be multiple code points.
  // To keep it robust, we instead regenerate sequence tokens explicitly.
  const patternSize = brokenPattern.length;
  const tokens: string[] = [];
  for (let i = 0; i < length; i++) tokens.push(brokenPattern[i % patternSize]);

  // Replace a random position with an emoji NOT in the pattern.
  const pos = randomInt(0, length);
  let replacement = sampleUnique(EMOJI_POOL, 1)[0];
  let guard = 0;
  while (brokenPattern.includes(replacement) && guard++ < 50) {
    replacement = sampleUnique(EMOJI_POOL, 1)[0];
  }
  tokens[pos] = replacement;
  rowData[brokenIndex] = tokens.join("");

  const id = randomId(16);

  const lines: string[] = [];
  lines.push("🧩 **Human check required**");
  lines.push("Exactly **one** line has a mistake in its repeating pattern.");
  lines.push("Tap the number (1–4).\n");

  // Put sequences in a code block to keep monospace spacing.
  lines.push("```");
  for (let i = 0; i < rowData.length; i++) {
    lines.push(`${i + 1}) ${rowData[i]}`);
  }
  lines.push("```");

  return {
    id,
    message: lines.join("\n"),
    correctRow: brokenIndex + 1,
  };
}

function sampleUnique<T>(arr: T[], n: number): T[] {
  if (n > arr.length) throw new Error("sampleUnique: n > arr.length");
  const copy = arr.slice();
  // Fisher-Yates partial shuffle
  for (let i = 0; i < n; i++) {
    const j = i + randomInt(0, copy.length - i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}
