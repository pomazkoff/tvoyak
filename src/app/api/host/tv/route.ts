import { randomBytes } from "node:crypto";
import { hashSecret, requireHost } from "@/lib/game/host-auth";
import { ipHash } from "@/lib/billing/server";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import {
  TV_CODE_TTL_MS,
  normalizeTvCode,
  randomTvCode,
} from "@/lib/rooms/tv-code";
import { getServiceSupabase } from "@/lib/supabase/admin";

// Телевизор без входа.
// mint   — телефон ведущего получает шестизначный код на 15 минут;
// claim  — телевизор меняет код на ключ экрана, код сгорает;
// status — телефон проверяет, что его код ещё жив и не забран.
// Ключи и коды в базе только хешами. Подбор режется лимитом по IP и общим.

const noStore = { "Cache-Control": "no-store" };

/** Попыток с одного адреса за 10 минут. 12 опечаток с пульта — не подбор. */
const IP_LIMIT = 12;
/**
 * Попыток со всех адресов за 10 минут, включая верные.
 * Строка лимита блокируется на каждую попытку, поэтому параллельный
 * перебор не проскакивает пачкой. 600 за 10 минут — далеко от миллиона кодов
 * и с запасом на обычный вечер.
 */
const GLOBAL_LIMIT = 600;

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: noStore });
}

function schemaMissing(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "42883" ||
    error.code === "PGRST202" ||
    error.code === "PGRST204"
  );
}

type Gate = "ok" | "limited" | "down";

async function rateGate(
  supabase: ReturnType<typeof getServiceSupabase>,
  request: Request,
): Promise<Gate> {
  const ip = ipHash(request) ?? "unknown";
  const [byIp, global] = await Promise.all([
    supabase.rpc("tv_code_rate_hit", { p_key: `ip:${ip}`, p_limit: IP_LIMIT }),
    supabase.rpc("tv_code_rate_hit", {
      p_key: "global",
      p_limit: GLOBAL_LIMIT,
    }),
  ]);
  if (byIp.error || global.error) return "down";
  if (byIp.data === false || global.data === false) return "limited";
  return "ok";
}

async function forgetExpired(supabase: ReturnType<typeof getServiceSupabase>) {
  await supabase
    .from("room_secrets")
    .update({ tv_code_hash: null, tv_code_expires_at: null })
    .lt("tv_code_expires_at", new Date().toISOString())
    .not("tv_code_hash", "is", null);
}

export async function POST(request: Request) {
  let body: {
    action?: unknown;
    code?: unknown;
    hostSecret?: unknown;
    tvCode?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return reply({ error: "invalid_json" }, 400);
  }
  if (typeof body.action !== "string") {
    return reply({ error: "invalid_body" }, 400);
  }

  try {
    const supabase = getServiceSupabase();

    if (body.action === "claim") {
      const gate = await rateGate(supabase, request);
      if (gate === "down") {
        return reply({ ok: false, error: "tv_unavailable" }, 503);
      }
      if (gate === "limited") {
        return reply({ ok: false, error: "tv_rate" }, 429);
      }
      const tvCode = normalizeTvCode(
        typeof body.tvCode === "string" ? body.tvCode : null,
      );
      if (!tvCode) return reply({ ok: false, error: "bad_tv_code" }, 400);

      const codeHash = hashSecret(tvCode);
      const { data: secret, error: lookupError } = await supabase
        .from("room_secrets")
        .select("room_id")
        .eq("tv_code_hash", codeHash)
        .gt("tv_code_expires_at", new Date().toISOString())
        .maybeSingle();
      if (lookupError) {
        if (schemaMissing(lookupError)) {
          return reply({ ok: false, error: "tv_unavailable" }, 503);
        }
        return reply({ ok: false, error: "rpc_failed" }, 502);
      }
      if (!secret) return reply({ ok: false, error: "bad_tv_code" }, 403);

      const { data: room } = await supabase
        .from("rooms")
        .select("code")
        .eq("id", secret.room_id)
        .maybeSingle();
      if (!room?.code) return reply({ ok: false, error: "bad_tv_code" }, 403);

      const token = randomBytes(32).toString("base64url");
      // Условное обновление: код ещё тот и не просрочен — и сразу сгорел.
      // Два телевизора с одним кодом не пройдут оба.
      const { data: claimed, error: claimError } = await supabase
        .from("room_secrets")
        .update({
          tv_screen_hash: hashSecret(token),
          tv_code_hash: null,
          tv_code_expires_at: null,
        })
        .eq("room_id", secret.room_id)
        .eq("tv_code_hash", codeHash)
        .gt("tv_code_expires_at", new Date().toISOString())
        .select("room_id");
      if (claimError) return reply({ ok: false, error: "rpc_failed" }, 502);
      if (!claimed || claimed.length === 0) {
        return reply({ ok: false, error: "bad_tv_code" }, 403);
      }
      return reply({ ok: true, code: room.code, hostSecret: token });
    }

    const code =
      typeof body.code === "string" ? normalizeRoomCode(body.code) : null;
    const hostSecret =
      typeof body.hostSecret === "string" ? body.hostSecret : "";
    if (!code) return reply({ ok: false, error: "room_not_found" }, 404);

    if (body.action === "mint") {
      const auth = await requireHost(code, hostSecret);
      if (!auth.ok) return reply({ ok: false, error: auth.error }, 403);
      await forgetExpired(auth.supabase);
      const expiresAt = new Date(Date.now() + TV_CODE_TTL_MS).toISOString();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const tvCode = randomTvCode((size) => randomBytes(size));
        const { data, error } = await auth.supabase
          .from("room_secrets")
          .update({
            tv_code_hash: hashSecret(tvCode),
            tv_code_expires_at: expiresAt,
          })
          .eq("room_id", auth.room.id)
          .select("room_id");
        if (error?.code === "23505") continue;
        if (error) {
          if (schemaMissing(error)) {
            return reply({ ok: false, error: "tv_unavailable" }, 503);
          }
          return reply({ ok: false, error: "rpc_failed" }, 502);
        }
        if (!data || data.length === 0) {
          return reply({ ok: false, error: "rpc_failed" }, 502);
        }
        return reply({ ok: true, tvCode, expiresAt });
      }
      return reply({ ok: false, error: "rpc_failed" }, 502);
    }

    if (body.action === "status") {
      const auth = await requireHost(code, hostSecret);
      if (!auth.ok) return reply({ ok: false, error: auth.error }, 403);
      const tvCode = normalizeTvCode(
        typeof body.tvCode === "string" ? body.tvCode : null,
      );
      const { data, error } = await auth.supabase
        .from("room_secrets")
        .select("tv_code_hash, tv_code_expires_at, tv_screen_hash")
        .eq("room_id", auth.room.id)
        .maybeSingle();
      if (error) {
        if (schemaMissing(error)) {
          return reply({ ok: false, error: "tv_unavailable" }, 503);
        }
        return reply({ ok: false, error: "rpc_failed" }, 502);
      }
      const expiresAt =
        typeof data?.tv_code_expires_at === "string"
          ? data.tv_code_expires_at
          : null;
      const active = Boolean(
        tvCode &&
        data?.tv_code_hash &&
        data.tv_code_hash === hashSecret(tvCode) &&
        expiresAt &&
        Date.parse(expiresAt) > Date.now(),
      );
      return reply({
        ok: true,
        active,
        linked: Boolean(data?.tv_screen_hash),
        expiresAt: active ? expiresAt : null,
      });
    }

    return reply({ ok: false, error: "bad_action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return reply({ error: "not_configured" }, 500);
    }
    console.error("tv_code");
    return reply({ error: "rpc_failed" }, 502);
  }
}
