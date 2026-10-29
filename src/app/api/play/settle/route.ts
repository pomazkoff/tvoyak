import { settleBotFinal } from "@/lib/game/turn";

// Финал у бота: любой экран партии (телефон или ТВ) просит сервер проверить
// ответы и подвести итог. Сервер сам решает, пора ли: вне judging раунда 3
// и вне режима бота ничего не происходит.
export async function POST(request: Request) {
  let body: { code?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.code !== "string" || !/^[A-Za-z]{4}$/.test(body.code)) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const result = await settleBotFinal(body.code.toUpperCase());
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("play_settle");
    return Response.json({ error: "rpc_failed" }, { status: 502 });
  }
}
