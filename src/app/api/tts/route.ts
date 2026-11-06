import { requireHost, requirePlayer } from "@/lib/game/host-auth";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { RateLimiter, TTS_MAX_CHARS } from "@/lib/tts/phrases";
import { isAllowedInRoom, isCurrentPrompt } from "@/lib/tts/room-phrases";
import {
  getSpeech,
  isTtsConfigured,
  readCachedSpeech,
} from "@/lib/tts/speechkit";

export const maxDuration = 30;

// Ведущий говорит раз в несколько секунд; 40 фраз в минуту на комнату —
// с запасом для игры и мало для злоупотреблений.
const perRoom = new RateLimiter(40, 60_000);
const perIp = new RateLimiter(120, 60_000);

export async function POST(request: Request) {
  if (!isTtsConfigured()) {
    return Response.json({ error: "tts_not_configured" }, { status: 503 });
  }
  let body: {
    text?: unknown;
    code?: unknown;
    hostSecret?: unknown;
    playerToken?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  if (
    typeof body.text !== "string" ||
    typeof body.code !== "string" ||
    (typeof body.hostSecret !== "string" &&
      typeof body.playerToken !== "string")
  ) {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }
  const text = body.text;
  if (!text.trim() || text.length > TTS_MAX_CHARS) {
    return Response.json({ error: "bad_text" }, { status: 400 });
  }
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!perIp.take(ip)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  try {
    // Кэш читаем параллельно с проверкой ведущего: отдаём его только
    // после всех проверок, но не ждём лишний круг до хранилища.
    const cachedJob = readCachedSpeech(getServiceSupabase(), text);
    // Экран ведущего — по ключу комнаты; телефон игрока «не у экрана» —
    // по ключу игрока и только текущий вопрос.
    const byPlayer = typeof body.hostSecret !== "string";
    const auth = byPlayer
      ? await requirePlayer(body.code, String(body.playerToken))
      : await requireHost(body.code, String(body.hostSecret));
    if (!auth.ok) return Response.json({ error: auth.error }, { status: 403 });
    if (auth.room.status === "finished") {
      return Response.json({ error: "room_finished" }, { status: 403 });
    }
    if (!perRoom.take(auth.room.id)) {
      return Response.json({ error: "rate_limited" }, { status: 429 });
    }
    const allowed = byPlayer
      ? await isCurrentPrompt(auth.supabase, auth.room.id, text)
      : await isAllowedInRoom(auth.supabase, auth.room.id, text);
    if (!allowed) {
      return Response.json({ error: "phrase_not_allowed" }, { status: 403 });
    }
    const { audio, cache } = await getSpeech(
      auth.supabase,
      text,
      await cachedJob,
    );
    return new Response(new Uint8Array(audio), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audio.length),
        "Cache-Control": "private, max-age=86400",
        "X-TTS-Cache": cache,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("tts", message);
    return Response.json({ error: "tts_failed" }, { status: 502 });
  }
}
