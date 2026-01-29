/** Cryptographically secure random integer in [min, max). */
export function randomInt(min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max <= min) {
    throw new Error(`randomInt: invalid range ${min}..${max}`);
  }
  const range = max - min;
  // Use 32-bit rejection sampling to avoid modulo bias.
  const maxUint = 0xFFFFFFFF;
  const limit = maxUint - (maxUint % range);
  const buf = new Uint32Array(1);
  while (true) {
    crypto.getRandomValues(buf);
    const x = buf[0];
    if (x < limit) return min + (x % range);
  }
}

/** Random URL-safe id (base64url without padding). */
export function randomId(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base64UrlEncode(arr);
}

function base64UrlEncode(bytes: Uint8Array): string {
  // btoa expects a binary string.
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
