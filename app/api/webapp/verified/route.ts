import { requireWebAppAdmin } from "../../../../src/webapp/server";
import { setGroupConfig } from "../../../../src/config/store";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const auth = await requireWebAppAdmin(body);
  if (!auth.ok) return auth.response;

  const updated = await setGroupConfig(auth.storage.configStorage, auth.chatId, {
    verifiedUsers: {}
  });
  return Response.json({ ok: true, data: { config: updated } });
}
