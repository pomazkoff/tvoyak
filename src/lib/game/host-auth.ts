import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { isPhoneToken } from "@/lib/rooms/host-phone";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { HostMode, RoomStatus } from "@/lib/supabase/types";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Сравнение хешей без утечки по времени. */
export function sameHash(stored: string | null | undefined, secret: string) {
  if (!stored) return false;
  const left = Buffer.from(stored, "utf8");
  const right = Buffer.from(hashSecret(secret), "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

type HostRoom = {
  id: string;
  code: string;
  host_mode: HostMode;
  status: RoomStatus;
};

export type HostCredentials = {
  /** Ключ комнаты — у большого экрана ведущего. */
  hostSecret?: string;
  /** Ключ телефона ведущего — после привязки по одноразовому коду. */
  phoneToken?: string;
};

async function loadRoom(code: string) {
  const supabase = getServiceSupabase();
  const normalized = code.trim().toUpperCase();
  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, code, host_mode, status")
    .eq("code", normalized)
    .maybeSingle();
  if (error || !room) return null;
  const { data: secretRow } = await supabase
    .from("room_secrets")
    .select("host_secret_hash, phone_token_hash")
    .eq("room_id", room.id)
    .maybeSingle();
  return {
    supabase,
    room: room as HostRoom,
    secrets: secretRow as {
      host_secret_hash: string;
      phone_token_hash: string | null;
    } | null,
  };
}

/** Только экран ведущего (ключ комнаты): привязка телефона, голос, TTS. */
export async function requireHost(code: string, secret: string) {
  if (!secret) return { ok: false as const, error: "not_host" };
  const loaded = await loadRoom(code);
  if (!loaded) return { ok: false as const, error: "room_not_found" };
  if (!sameHash(loaded.secrets?.host_secret_hash, secret)) {
    return { ok: false as const, error: "not_host" };
  }
  return { ok: true as const, supabase: loaded.supabase, room: loaded.room };
}

/** Экран ведущего или привязанный телефон ведущего: ходы партии и эталон. */
export async function requireHostOrPhone(
  code: string,
  credentials: HostCredentials,
) {
  const { hostSecret, phoneToken } = credentials;
  if (!hostSecret && !isPhoneToken(phoneToken)) {
    return { ok: false as const, error: "not_host" };
  }
  const loaded = await loadRoom(code);
  if (!loaded) return { ok: false as const, error: "room_not_found" };
  const viaScreen =
    Boolean(hostSecret) &&
    sameHash(loaded.secrets?.host_secret_hash, hostSecret ?? "");
  const viaPhone =
    !viaScreen &&
    isPhoneToken(phoneToken) &&
    sameHash(loaded.secrets?.phone_token_hash, phoneToken);
  if (!viaScreen && !viaPhone) {
    return {
      ok: false as const,
      error: phoneToken && !hostSecret ? "phone_revoked" : "not_host",
    };
  }
  return {
    ok: true as const,
    supabase: loaded.supabase,
    room: loaded.room,
    via: viaScreen ? ("screen" as const) : ("phone" as const),
  };
}
