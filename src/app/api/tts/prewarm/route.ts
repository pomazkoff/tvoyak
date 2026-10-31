import { after } from "next/server";
import { SURPRISE_SPEECH } from "@/lib/game/surprises";
import { requireHost } from "@/lib/game/host-auth";
import { RateLimiter } from "@/lib/tts/phrases";
import { roomPhrases } from "@/lib/tts/room-phrases";
import { isTtsConfigured, prewarmSpeech } from "@/lib/tts/speechkit";

export const maxDuration = 60;

const perRoom = new RateLimiter(6, 60_000);

/**
 * Прогрев голоса на раунд: синтезирует в фоне ещё не закэшированные
 * вопросы текущего раунда и вердикты, чтобы на открытии вопроса звук
 * уже лежал в хранилище.
 */
export async function POST(request: Request) {
  if (!isTtsConfigured()) {
    return Response.json({ error: "tts_not_configured" }, { status: 503 });
  }
  let body: { code?: unknown; hostSecret?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.code !== "string" || typeof body.hostSecret !== "string") {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  try {
    const auth = await requireHost(body.code, body.hostSecret);
    if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
    if (auth.room.status === "finished" || auth.room.status === "lobby") {
      return Response.json({ ok: true, queued: 0 });
    }
    if (!perRoom.take(auth.room.id)) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
    const phrases = await roomPhrases(auth.supabase, auth.room.id);
    const texts = [
      "Верно!",
      "Неверно.",
      ...phrases.upcoming.slice(0, 60),
      // Объявления «Сюрпризов» — общие, в кэше один раз на всех.
      ...SURPRISE_SPEECH,
    ];
    after(async () => {
      await prewarmSpeech(auth.supabase, texts);
    });
    return Response.json({ ok: true, queued: texts.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("tts_prewarm", message);
    return Response.json({ error: "prewarm_failed" }, { status: 502 });
  }
}
