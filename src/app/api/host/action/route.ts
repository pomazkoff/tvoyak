import { hostAction } from "@/lib/game/turn";

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    code?: unknown;
    hostSecret?: unknown;
    correct?: unknown;
    decisions?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (
    typeof body.action !== "string" ||
    typeof body.code !== "string" ||
    typeof body.hostSecret !== "string"
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const decisions = Array.isArray(body.decisions)
    ? body.decisions.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { playerId?: unknown; correct?: unknown };
        if (
          typeof row.playerId !== "string" ||
          typeof row.correct !== "boolean"
        )
          return [];
        return [{ playerId: row.playerId, correct: row.correct }];
      })
    : undefined;

  try {
    const result = await hostAction({
      action: body.action,
      code: body.code,
      hostSecret: body.hostSecret,
      correct: body.correct === true,
      decisions,
    });
    const status = result.ok === false ? 400 : 200;
    return Response.json(result, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("host_action");
    return Response.json({ error: "create_failed" }, { status: 502 });
  }
}
