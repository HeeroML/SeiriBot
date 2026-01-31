import { getBot, getStorage } from "../../../src/server/runtime";
import { sweepExpiredCaptchas } from "../../../src/sweep";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

export async function GET(): Promise<Response> {
  const storage = await getStorage();
  const bot = await getBot();
  const count = await sweepExpiredCaptchas(
    bot,
    storage.sessionStorage,
    storage.pendingIndexStore
  );
  return Response.json({ ok: true, count });
}
