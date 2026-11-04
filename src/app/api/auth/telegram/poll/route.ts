import { connection } from "next/server";
import {
  hashToken,
  isTokenShape,
  sessionForTelegram,
} from "@/lib/auth/telegram";
import { getServiceSupabase } from "@/lib/supabase/admin";

/** Статус токена: pending / expired / ok (+ сессия, один раз). */
export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as {
    token?: unknown;
  } | null;
  if (!isTokenShape(body?.token)) {
    return Response.json({ status: "invalid" }, { status: 400 });
  }
  const supabase = getServiceSupabase();
  const hash = hashToken(body.token);
  const { data: row } = await supabase
    .from("tg_login_tokens")
    .select("expires_at, tg_id, confirmed_at, consumed_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!row || row.consumed_at) return Response.json({ status: "invalid" });
  if (!row.confirmed_at) {
    return Response.json({
      status:
        Date.parse(row.expires_at as string) < Date.now()
          ? "expired"
          : "pending",
    });
  }
  // Забираем токен атомарно, чтобы сессию получил только один запрос.
  const { data: claimed } = await supabase
    .from("tg_login_tokens")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token_hash", hash)
    .is("consumed_at", null)
    .not("confirmed_at", "is", null)
    .select("tg_id, tg_name, tg_username")
    .maybeSingle();
  if (!claimed?.tg_id) return Response.json({ status: "invalid" });
  const session = await sessionForTelegram(supabase, {
    id: Number(claimed.tg_id),
    name: (claimed.tg_name as string | null) ?? "",
    username: (claimed.tg_username as string | null) ?? null,
  });
  if (!session) {
    return Response.json({ status: "error" }, { status: 500 });
  }
  return Response.json({ status: "ok", session });
}
