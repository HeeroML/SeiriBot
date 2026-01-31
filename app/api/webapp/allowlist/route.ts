import { requireWebAppAdmin } from "../../../../src/webapp/server";
import { addAllowlistUser, removeAllowlistUser } from "../../../../src/config/store";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const auth = await requireWebAppAdmin(body);
  if (!auth.ok) return auth.response;

  const userId = Number(body.userId);
  if (!Number.isFinite(userId)) {
    return Response.json({ ok: false, error: "Ungueltige userId." }, { status: 400 });
  }

  let updated;
  if (body.action === "add") {
    updated = await addAllowlistUser(auth.storage.configStorage, auth.chatId, userId);
  } else if (body.action === "remove") {
    updated = await removeAllowlistUser(auth.storage.configStorage, auth.chatId, userId);
  } else {
    return Response.json({ ok: false, error: "Ungueltige Aktion." }, { status: 400 });
  }

  return Response.json({ ok: true, data: { config: updated } });
}
