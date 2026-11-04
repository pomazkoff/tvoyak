import { connection } from "next/server";
import { botUsername, hashToken, newLoginToken } from "@/lib/auth/telegram";
import { originFromHeaders } from "@/lib/http/origin";
import { getServiceSupabase } from "@/lib/supabase/admin";

/** Создаёт одноразовый токен входа и отдаёт ссылку на бота. */
export async function POST(request: Request) {
  await connection();
  const origin = originFromHeaders(request.headers);
  const allowed =
    /^https:\/\/(www\.)?tvoyak\.ru$/.test(origin) ||
    /^https:\/\/tvoyak-[a-z0-9-]+-pomazkoff4-4028s-projects\.vercel\.app$/.test(
      origin,
    ) ||
    (!process.env.VERCEL && /^http:\/\/localhost(:\d+)?$/.test(origin));
  if (!allowed) {
    return Response.json({ error: "bad_origin" }, { status: 400 });
  }
  const token = newLoginToken();
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("tg_login_tokens")
    .insert({ token_hash: hashToken(token), origin });
  if (error) {
    console.error("tg_login_start", error.code);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
  return Response.json({
    token,
    url: `https://t.me/${botUsername()}?start=login_${token}`,
  });
}
