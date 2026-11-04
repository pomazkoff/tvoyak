import { parseLead, leadMessage } from "@/lib/b2b/lead";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { RateLimiter } from "@/lib/tts/phrases";

/**
 * Заявка с /business. Пишет в b2b_leads ключом service role (у таблицы
 * RLS без публичных политик) и, если заданы TELEGRAM_BOT_TOKEN и
 * TELEGRAM_CHAT_ID, присылает уведомление в Telegram. Без них заявка просто
 * сохраняется.
 */

// Память инстанса: от случайного спама хватает (как у /api/tts).
const perIpMinute = new RateLimiter(3, 60_000);
const perIpDay = new RateLimiter(10, 24 * 60 * 60_000);

const MAX_BODY_BYTES = 8_000;

function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

async function notifyTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) console.error("b2b_lead_telegram", response.status);
    return response.ok;
  } catch {
    console.error("b2b_lead_telegram", "network");
    return false;
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

  const parsed = parseLead(body);
  // Бот заполнил ловушку: делаем вид, что всё хорошо.
  if (parsed.ok === "spam") return Response.json({ ok: true });
  if (!parsed.ok)
    return Response.json(
      { error: parsed.error, field: parsed.field },
      { status: 400 },
    );

  const ip = clientIp(request);
  if (!perIpMinute.take(ip) || !perIpDay.take(ip))
    return Response.json({ error: "rate_limited" }, { status: 429 });

  const { lead } = parsed;
  let notified = false;
  try {
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("b2b_leads")
      .insert({
        name: lead.name,
        company: lead.company,
        lead_type: lead.type,
        contact: lead.contact,
        event_date: lead.eventDate,
        comment: lead.comment,
        source: "business",
        user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      console.error("b2b_lead_insert", error?.code ?? "empty");
      // Заявку не потеряем, если хотя бы уведомление ушло.
      notified = await notifyTelegram(leadMessage(lead));
      if (!notified)
        return Response.json({ error: "save_failed" }, { status: 502 });
      return Response.json({ ok: true });
    }
    notified = await notifyTelegram(leadMessage(lead));
    if (notified) {
      const { error: markError } = await supabase
        .from("b2b_leads")
        .update({ notified_at: new Date().toISOString() })
        .eq("id", data.id);
      if (markError) console.error("b2b_lead_mark", markError.code);
    }
    return Response.json({ ok: true });
  } catch {
    console.error("b2b_lead", "unexpected");
    return Response.json({ error: "save_failed" }, { status: 502 });
  }
}
