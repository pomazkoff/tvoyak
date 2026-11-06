import { after } from "next/server";
import { paywallEnabled } from "@/lib/billing/config";
import { consumeGame, releaseGame } from "@/lib/billing/server";
import { requireHost, requireHostOrPhone } from "@/lib/game/host-auth";
import { SURPRISE_SPEECH } from "@/lib/game/surprises";
import { hostAction } from "@/lib/game/turn";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { roomPhrases } from "@/lib/tts/room-phrases";
import { isTtsConfigured, prewarmSpeech } from "@/lib/tts/speechkit";

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    code?: unknown;
    hostSecret?: unknown;
    phoneToken?: unknown;
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
    (typeof body.hostSecret !== "string" && typeof body.phoneToken !== "string")
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

  let billedRoom: string | null = null;
  try {
    // Оплата: партия списывается на старте (не при создании комнаты).
    // Списываем до start_game и возвращаем, если старт не прошёл.
    if (body.action === "start" && paywallEnabled()) {
      const auth = await requireHostOrPhone(body.code, {
        hostSecret:
          typeof body.hostSecret === "string" ? body.hostSecret : undefined,
        phoneToken:
          typeof body.phoneToken === "string" ? body.phoneToken : undefined,
      });
      if (!auth.ok) {
        return Response.json({ ok: false, error: auth.error }, { status: 400 });
      }
      const charge = await consumeGame(auth.supabase, auth.room.id);
      if (!charge.ok) {
        return Response.json(
          { ok: false, error: charge.error ?? "payment_required" },
          { status: 402 },
        );
      }
      // Повторный старт уже оплаченной комнаты нельзя «возвращать».
      if (!("repeat" in charge && charge.repeat)) billedRoom = auth.room.id;
    }
    const result = await hostAction({
      action: body.action,
      code: body.code,
      hostSecret:
        typeof body.hostSecret === "string" ? body.hostSecret : undefined,
      phoneToken:
        typeof body.phoneToken === "string" ? body.phoneToken : undefined,
      correct: body.correct === true,
      questionId:
        typeof body.questionId === "string" ? body.questionId : undefined,
      playerId: typeof body.playerId === "string" ? body.playerId : undefined,
      decisions,
    });
    if (billedRoom && result.ok !== true) {
      await releaseGame(getServiceSupabase(), billedRoom);
    }
    if (
      body.action === "start" &&
      result.ok === true &&
      typeof body.hostSecret === "string" &&
      isTtsConfigured()
    ) {
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
            // Фразы «Сюрпризов» общие для всех комнат: кэш один раз.
            ...SURPRISE_SPEECH,
          ]);
        } catch {
          console.error("tts_prewarm_start");
        }
      });
    }
    const status = result.ok === false ? 400 : 200;
    return Response.json(result, { status });
  } catch (error) {
    if (billedRoom) await releaseGame(getServiceSupabase(), billedRoom);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("host_action");
    return Response.json({ error: "rpc_failed" }, { status: 502 });
  }
}
