import { openTogether } from "@/lib/game/turn";

// Телефон игрока открывает общий ответ, когда вопрос уже на кнопке или это кот.
// Пока ведущий читает вопрос, функция этого не делает.

export async function POST(request: Request) {
  let body: { code?: unknown; token?: unknown; action?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    body.action !== "open" ||
    typeof body.code !== "string" ||
    typeof body.token !== "string"
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const result = await openTogether(body.code, body.token);
    return Response.json(result, { status: result.ok === false ? 400 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("play_together");
    return Response.json({ error: "rpc_failed" }, { status: 502 });
  }
}
