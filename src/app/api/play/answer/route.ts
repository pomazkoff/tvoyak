import { submitPlayerAnswer } from "@/lib/game/turn";

export async function POST(request: Request) {
  let body: { code?: unknown; token?: unknown; text?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.code !== "string" ||
    typeof body.token !== "string" ||
    typeof body.text !== "string"
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  if (body.text.length > 300) {
    return Response.json({ error: "too_long" }, { status: 400 });
  }

  try {
    const result = await submitPlayerAnswer(body.code, body.token, body.text);
    return Response.json(result, { status: result.ok === false ? 400 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("play_answer");
    return Response.json({ error: "rpc_failed" }, { status: 502 });
  }
}
