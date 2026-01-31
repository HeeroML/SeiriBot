import { requireWebAppUser, getManagedGroupsForUser } from "../../../../src/webapp/server";

export const runtime = "nodejs";
export const preferredRegion = "fra1";

export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => ({}));
  const userResult = await requireWebAppUser(body);
  if (!userResult.ok) return userResult.response;
  const groups = await getManagedGroupsForUser(userResult.user.id);
  return Response.json({ ok: true, data: { groups } });
}
