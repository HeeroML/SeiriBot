import { requireWebAppAdmin } from "../../../../../src/webapp/server";
import { setGroupConfig } from "../../../../../src/config/store";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

type ConfigPatch = {
  welcomeMessage?: string;
  rulesMessage?: string;
  deleteServiceMessages?: boolean;
};

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const auth = await requireWebAppAdmin(body);
  if (!auth.ok) return auth.response;

  const patch: ConfigPatch = {};
  if (typeof body.welcomeMessage === "string") {
    patch.welcomeMessage = body.welcomeMessage.trim();
  }
  if (typeof body.rulesMessage === "string") {
    patch.rulesMessage = body.rulesMessage.trim();
  }
  if (typeof body.deleteServiceMessages === "boolean") {
    patch.deleteServiceMessages = body.deleteServiceMessages;
  }

  const updated = await setGroupConfig(auth.storage.configStorage, auth.chatId, patch);
  return Response.json({ ok: true, data: { config: updated } });
}
