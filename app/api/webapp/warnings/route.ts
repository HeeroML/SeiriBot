import { requireWebAppAdmin } from "../../../../src/webapp/server";
import {
  createWarningStore,
  decrementWarning,
  getWarning,
  incrementWarning
} from "../../../../src/moderation/warnings";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const auth = await requireWebAppAdmin(body);
  if (!auth.ok) return auth.response;

  const userId = Number(body.userId);
  if (!Number.isFinite(userId)) {
    return Response.json({ ok: false, error: "Ungueltige userId." }, { status: 400 });
  }

  const store = createWarningStore(auth.storage.metaStorage);

  if (body.action === "get") {
    const warning = await getWarning(store, auth.chatId, userId);
    return Response.json({ ok: true, data: { warning } });
  }

  if (body.action === "increment") {
    const reason = typeof body.reason === "string" ? body.reason : undefined;
    const warning = await incrementWarning(store, auth.chatId, userId, reason, auth.user.id);
    return Response.json({ ok: true, data: { warning } });
  }

  if (body.action === "decrement") {
    const warning = await decrementWarning(store, auth.chatId, userId, auth.user.id);
    return Response.json({ ok: true, data: { warning } });
  }

  return Response.json({ ok: false, error: "Ungueltige Aktion." }, { status: 400 });
}
