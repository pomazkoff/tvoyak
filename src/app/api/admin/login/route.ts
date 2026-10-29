import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminScope } from "@/lib/admin-auth";

async function remember(token: string) {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: Boolean(process.env.VERCEL),
  });
}

export async function POST(request: Request) {
  let token = "";
  try {
    const body = (await request.json()) as { token?: unknown };
    token = typeof body.token === "string" ? body.token : "";
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!adminScope(token)) {
    return Response.json({ ok: false, error: "not_host" }, { status: 401 });
  }
  await remember(token);
  return Response.json({ ok: true });
}

/** Ссылка с токеном: /api/admin/login?token=…&next=/admin/pictures — ставит cookie и уводит на страницу. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = url.searchParams.get("next") ?? "/admin/pictures";
  const safeNext = next.startsWith("/admin") ? next : "/admin/pictures";
  if (adminScope(token)) await remember(token);
  return new Response(null, {
    status: 303,
    headers: {
      Location: safeNext,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
