import { buildPack } from "@/lib/packs/pipeline";

function authorized(request: Request): boolean {
  const admin = process.env.ADMIN_TOKEN;
  const cron = process.env.CRON_SECRET;
  if (!admin && !cron) return false;
  const header = request.headers.get("x-admin-token");
  const bearer = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  return Boolean(
    (admin && (header === admin || bearer === admin)) ||
    (cron && bearer === cron),
  );
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "not_host" }, { status: 401 });
  }
  try {
    const result = await buildPack();
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json(
        { ok: false, error: "not_configured" },
        { status: 500 },
      );
    }
    console.error("build_pack");
    return Response.json(
      { ok: false, error: "pipeline_failed" },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
