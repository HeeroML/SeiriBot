import { requireWebAppAdmin } from "../../../../src/webapp/server";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const auth = await requireWebAppAdmin(body);
  if (!auth.ok) return auth.response;
  return Response.json({
    ok: true,
    data: {
      user: auth.user,
      chatId: auth.chatId,
      chatTitle: auth.chatTitle
    }
  });
}
