import { createHmac, timingSafeEqual } from "node:crypto";

export type WebAppUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
};

export type WebAppInitData = {
  user?: WebAppUser;
  authDate?: number;
  data: Record<string, string>;
};

function safeEqualHex(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  const leftBuf = Buffer.from(left, "hex");
  const rightBuf = Buffer.from(right, "hex");
  if (leftBuf.length !== rightBuf.length) return false;
  return timingSafeEqual(leftBuf, rightBuf);
}

export function validateInitData(initData: string, botToken: string): WebAppInitData | null {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (!safeEqualHex(computed, hash)) return null;

  const data: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    data[key] = value;
  }

  let user: WebAppUser | undefined;
  if (data.user) {
    try {
      user = JSON.parse(data.user) as WebAppUser;
    } catch (error) {
      user = undefined;
    }
  }

  const authDate = data.auth_date ? Number(data.auth_date) : undefined;
  return { user, authDate, data };
}
