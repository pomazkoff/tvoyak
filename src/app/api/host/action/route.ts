import { after } from "next/server";
import { requireHost } from "@/lib/game/host-auth";
import { hostAction } from "@/lib/game/turn";
import { roomPhrases } from "@/lib/tts/room-phrases";
import { isTtsConfigured, prewarmSpeech } from "@/lib/tts/speechkit";

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    code?: unknown;
    hostSecret?: unknown;
    correct?: unknown;
    questionId?: unknown;
    playerId?: unknown;
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
      questionId:
        typeof body.questionId === "string" ? body.questionId : undefined,
      playerId: typeof body.playerId === "string" ? body.playerId : undefined,
      decisions,
    });
    if (body.action === "start" && result.ok === true && isTtsConfigured()) {
      // Поле готово — заранее озвучиваем вопросы первого раунда голосом
      // Марины, чтобы на открытии вопроса звук уже был в кэше.
      const code = body.code;
      const secret = body.hostSecret;
      after(async () => {
        try {
          const auth = await requireHost(code, secret);
          if (!auth.ok || auth.room.host_mode !== "bot") return;
          const phrases = await roomPhrases(auth.supabase, auth.room.id);
          await prewarmSpeech(auth.supabase, [
            "Верно!",
            "Неверно.",
            ...phrases.upcoming,
          ]);
        } catch {
          console.error("tts_prewarm_start");
        }
      });
    }
    const status = result.ok === false ? 400 : 200;
    return Response.json(result, { status });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("host_action");
    return Response.json({ error: "rpc_failed" }, { status: 502 });
  }
}
