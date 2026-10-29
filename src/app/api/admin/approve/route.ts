import { cookies } from "next/headers";
import { approvePack } from "@/lib/packs/pipeline";

export async function POST(request: Request) {
  const jar = await cookies();
  if (
    !process.env.ADMIN_TOKEN ||
    jar.get("tvoyak_admin")?.value !== process.env.ADMIN_TOKEN
  ) {
    return Response.json({ ok: false, error: "not_host" }, { status: 401 });
  }
  let packId = "";
  try {
    const body = (await request.json()) as { packId?: unknown };
    packId = typeof body.packId === "string" ? body.packId : "";
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!packId)
    return Response.json({ ok: false, error: "bad_phase" }, { status: 400 });
  const result = await approvePack(packId);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
