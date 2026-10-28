import { cookies } from "next/headers";

export async function POST(request: Request) {
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!process.env.ADMIN_TOKEN || token !== process.env.ADMIN_TOKEN) {
    return Response.json({ ok: false, error: "not_host" }, { status: 401 });
  }
  const jar = await cookies();
  jar.set("tvoyak_admin", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: Boolean(process.env.VERCEL),
  });
  return Response.json({ ok: true });
}
