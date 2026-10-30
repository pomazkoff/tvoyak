import { randomBytes } from "node:crypto";
import {
  hashSecret,
  requireHost,
  requireHostOrPhone,
} from "@/lib/game/host-auth";
import {
  PAIR_TTL_MS,
  normalizePairCode,
  randomPairCode,
} from "@/lib/rooms/host-phone";
import { getServiceSupabase } from "@/lib/supabase/admin";

// Привязка телефона ведущего.
// pair       — экран ведущего (ключ комнаты) получает одноразовый код на 10 минут;
// claim      — телефон меняет код на свой ключ, код сгорает, старый телефон
//              (если был) теряет доступ;
// disconnect — экран или сам телефон отвязывает телефон;
// check      — телефон проверяет, что его ключ ещё действует.
// Ключи и коды хранятся только хешами в room_secrets (anon её не читает).

const noStore = { "Cache-Control": "no-store" };

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: noStore });
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    code?: unknown;
    hostSecret?: unknown;
    phoneToken?: unknown;
    pair?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }
  if (typeof body.action !== "string" || typeof body.code !== "string") {
    return reply({ error: "invalid_body" }, 400);
  }
  const code = body.code.trim().toUpperCase();
  const hostSecret =
    typeof body.hostSecret === "string" ? body.hostSecret : undefined;
  const phoneToken =
    typeof body.phoneToken === "string" ? body.phoneToken : undefined;

  try {
    if (body.action === "pair") {
      const auth = await requireHost(code, hostSecret ?? "");
      if (!auth.ok) return reply({ ok: false, error: auth.error }, 403);
      if (auth.room.host_mode !== "human") {
        return reply({ ok: false, error: "bot_host" }, 400);
      }
      const pair = randomPairCode((size) => randomBytes(size));
      const expiresAt = new Date(Date.now() + PAIR_TTL_MS).toISOString();
      const { error } = await auth.supabase
        .from("room_secrets")
        .update({
          phone_pair_hash: hashSecret(`${auth.room.id}:${pair}`),
          phone_pair_expires_at: expiresAt,
        })
        .eq("room_id", auth.room.id);
      if (error) return reply({ ok: false, error: "rpc_failed" }, 502);
      return reply({ ok: true, pair, expiresAt });
    }

    if (body.action === "claim") {
      const pair = normalizePairCode(
        typeof body.pair === "string" ? body.pair : null,
      );
      if (!pair) return reply({ ok: false, error: "bad_pair" }, 400);
      const supabase = getServiceSupabase();
      const { data: room } = await supabase
        .from("rooms")
        .select("id, host_mode")
        .eq("code", code)
        .maybeSingle();
      if (!room) return reply({ ok: false, error: "room_not_found" }, 404);
      const token = randomBytes(32).toString("base64url");
      // Условное обновление: код совпал и не просрочен — и сразу сгорел.
      // Два телефона с одним кодом не пройдут оба.
      const { data: claimed, error } = await supabase
        .from("room_secrets")
        .update({
          phone_token_hash: hashSecret(token),
          phone_pair_hash: null,
          phone_pair_expires_at: null,
        })
        .eq("room_id", room.id)
        .eq("phone_pair_hash", hashSecret(`${room.id}:${pair}`))
        .gt("phone_pair_expires_at", new Date().toISOString())
        .select("room_id");
      if (error) return reply({ ok: false, error: "rpc_failed" }, 502);
      if (!claimed || claimed.length === 0) {
        return reply({ ok: false, error: "bad_pair" }, 403);
      }
      await supabase
        .from("rooms")
        .update({ host_phone: true })
        .eq("id", room.id);
      return reply({ ok: true, phoneToken: token });
    }

    if (body.action === "disconnect") {
      const auth = await requireHostOrPhone(code, { hostSecret, phoneToken });
      if (!auth.ok) return reply({ ok: false, error: auth.error }, 403);
      const { error } = await auth.supabase
        .from("room_secrets")
        .update({
          phone_token_hash: null,
          phone_pair_hash: null,
          phone_pair_expires_at: null,
        })
        .eq("room_id", auth.room.id);
      if (error) return reply({ ok: false, error: "rpc_failed" }, 502);
      await auth.supabase
        .from("rooms")
        .update({ host_phone: false })
        .eq("id", auth.room.id);
      return reply({ ok: true });
    }

    if (body.action === "check") {
      const auth = await requireHostOrPhone(code, { phoneToken });
      if (!auth.ok) return reply({ ok: false, error: auth.error }, 403);
      return reply({ ok: true });
    }

    return reply({ ok: false, error: "bad_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return reply({ error: "not_configured" }, 500);
    }
    console.error("host_phone");
    return reply({ error: "rpc_failed" }, 502);
  }
}
