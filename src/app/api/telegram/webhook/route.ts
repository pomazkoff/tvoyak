import { connection } from "next/server";
import {
  checkWebhookSecret,
  hashToken,
  tgSend,
  tokenFromStart,
} from "@/lib/auth/telegram";
import { getServiceSupabase } from "@/lib/supabase/admin";

type TgUpdate = {
  message?: {
    text?: string;
    chat?: { id: number; type?: string };
    from?: {
      id: number;
      is_bot?: boolean;
      first_name?: string;
      last_name?: string;
      username?: string;
    };
  };
};

/** Вебхук бота: подтверждает вход по «/start login_<token>». */
export async function POST(request: Request) {
  await connection();
  if (
    !checkWebhookSecret(request.headers.get("x-telegram-bot-api-secret-token"))
  ) {
    return new Response("forbidden", { status: 403 });
  }
  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  const msg = update?.message;
  const from = msg?.from;
  const chatId = msg?.chat?.id;
  // Только личка; группы (заявки) не трогаем.
  if (!msg || !from || from.is_bot || !chatId || msg.chat?.type !== "private") {
    return Response.json({ ok: true });
  }
  const token = tokenFromStart(msg.text);
  if (!token) {
    if (typeof msg.text === "string" && msg.text.startsWith("/start")) {
      await tgSend(
        chatId,
        "Привет! Чтобы войти, нажмите «Войти через Telegram» на сайте tvoyak.ru.",
      );
    }
    return Response.json({ ok: true });
  }
  const supabase = getServiceSupabase();
  const name = [from.first_name, from.last_name].filter(Boolean).join(" ");
  const { data } = await supabase
    .from("tg_login_tokens")
    .update({
      tg_id: from.id,
      tg_name: name || null,
      tg_username: from.username ?? null,
      confirmed_at: new Date().toISOString(),
    })
    .eq("token_hash", hashToken(token))
    .is("confirmed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("origin")
    .maybeSingle();
  if (!data) {
    await tgSend(
      chatId,
      "Ссылка для входа устарела. Нажмите «Войти через Telegram» на сайте ещё раз.",
    );
    return Response.json({ ok: true });
  }
  await tgSend(chatId, "Готово, вернись на сайт.", {
    text: "Вернуться в Твояк",
    url: `${data.origin as string}/pay`,
  });
  return Response.json({ ok: true });
}
