import { userFromRequest } from "@/lib/billing/server";
import { feedbackMessage, parseFeedback } from "@/lib/feedback";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { RateLimiter } from "@/lib/tts/phrases";

/** «Что-то не работает»: сообщение в группу заявок в Telegram. */
const perIpHour = new RateLimiter(5, 60 * 60_000);
const MAX_BODY_BYTES = 12_000;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

async function telegramUsername(request: Request): Promise<string | null> {
  if (!request.headers.get("authorization")) return null;
  try {
    const user = await userFromRequest(getServiceSupabase(), request);
    const name = user?.user_metadata?.telegram_username;
    return typeof name === "string" && name ? `@${name}` : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const raw = await request.text().catch(() => "");
  if (raw.length > MAX_BODY_BYTES)
    return Response.json({ error: "too_long" }, { status: 413 });
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  // Honeypot: живой человек это поле не видит и не заполняет.
  const trap = (body as { website?: unknown } | null)?.website;
  if (typeof trap === "string" && trap.trim())
    return Response.json({ ok: true });
  const parsed = parseFeedback(body);
  if (!parsed.ok)
    return Response.json({ error: parsed.error }, { status: 400 });
  if (!perIpHour.take(clientIp(request)))
    return Response.json({ error: "rate_limited" }, { status: 429 });
  const text = feedbackMessage(parsed.value, {
    username: await telegramUsername(request),
    userAgent: request.headers.get("user-agent") ?? "",
  });
  const sent = await notifyTelegram(text, "feedback_telegram");
  if (!sent) return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json({ ok: true });
}
