import { requireWebAppAdmin } from "../../../../src/webapp/server";
import {
  addFederationBan,
  addFederationChat,
  createFederationStores,
  getFederation,
  removeFederationBan,
  removeFederationChat
} from "../../../../src/federation/store";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const auth = await requireWebAppAdmin(body);
  if (!auth.ok) return auth.response;

  const stores = createFederationStores(auth.storage.metaStorage);
  const fedChatId = auth.chatId;

  if (body.action === "get") {
    const federation =
      (await getFederation(stores, fedChatId)) ?? {
        fedChatId,
        linkedChats: [],
        bannedUsers: []
      };
    return Response.json({ ok: true, data: { federation } });
  }

  if (body.action === "addChat" || body.action === "removeChat") {
    const targetChatId = Number(body.targetChatId);
    if (!Number.isFinite(targetChatId)) {
      return Response.json({ ok: false, error: "Ungueltige targetChatId." }, { status: 400 });
    }
    const federation =
      body.action === "addChat"
        ? await addFederationChat(stores, fedChatId, targetChatId)
        : await removeFederationChat(stores, fedChatId, targetChatId);
    return Response.json({ ok: true, data: { federation } });
  }

  if (body.action === "ban" || body.action === "unban") {
    const userId = Number(body.userId);
    if (!Number.isFinite(userId)) {
      return Response.json({ ok: false, error: "Ungueltige userId." }, { status: 400 });
    }
    const federation =
      body.action === "ban"
        ? await addFederationBan(stores, fedChatId, userId)
        : await removeFederationBan(stores, fedChatId, userId);
    return Response.json({ ok: true, data: { federation } });
  }

  return Response.json({ ok: false, error: "Ungueltige Aktion." }, { status: 400 });
}
