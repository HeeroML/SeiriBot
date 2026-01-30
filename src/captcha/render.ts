import { InlineKeyboard } from "grammy";
import type { CaptchaOption } from "./pattern";

const OPTION_LABELS = ["A", "B", "C", "D"];

export function formatOptionLabel(option: CaptchaOption, index: number): string {
  const label = OPTION_LABELS[index] ?? `${index + 1}`;
  const emoji = option.emoji ? `${option.emoji} ` : "";
  return `${label}) ${emoji}${option.text}`;
}

export function formatOptionLine(option: CaptchaOption, index: number): string {
  const emoji = option.emoji ? `${option.emoji} ` : "";
  return `${index + 1}) ${emoji}${option.text}`;
}

export function formatOptionsText(options: CaptchaOption[]): string {
  return options.map((option, index) => formatOptionLine(option, index)).join("\n");
}

export function buildChoiceKeyboard(
  options: CaptchaOption[],
  buildCallback: (index: number) => string,
  extras?: {
    textMode?: { label: string; callbackData: string };
    ban?: { label: string; callbackData: string };
  }
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  options.forEach((option, index) => {
    keyboard.text(formatOptionLabel(option, index), buildCallback(index + 1));
    keyboard.row();
  });

  if (extras?.textMode) {
    keyboard.text(extras.textMode.label, extras.textMode.callbackData).row();
  }

  if (extras?.ban) {
    keyboard.text(extras.ban.label, extras.ban.callbackData);
  }

  return keyboard;
}

export function buildNumericKeyboard(
  optionCount: number,
  buildCallback: (index: number) => string,
  extras?: { ban?: { label: string; callbackData: string } }
): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  for (let i = 1; i <= optionCount; i += 1) {
    keyboard.text(String(i), buildCallback(i)).row();
  }

  if (extras?.ban) {
    keyboard.text(extras.ban.label, extras.ban.callbackData);
  }

  return keyboard;
}
