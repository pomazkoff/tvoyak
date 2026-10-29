import "server-only";
import { createHash } from "node:crypto";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { HostMode, RoomStatus } from "@/lib/supabase/types";

export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

export async function requireHost(code: string, secret: string) {
  if (!secret) return { ok: false as const, error: "not_host" };
  const supabase = getServiceSupabase();
  const normalized = code.trim().toUpperCase();
  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, code, host_mode, status")
    .eq("code", normalized)
    .maybeSingle();
  if (error || !room) return { ok: false as const, error: "room_not_found" };

  const { data: secretRow } = await supabase
    .from("room_secrets")
    .select("host_secret_hash")
    .eq("room_id", room.id)
    .maybeSingle();
  if (!secretRow || secretRow.host_secret_hash !== hashSecret(secret)) {
    return { ok: false as const, error: "not_host" };
  }

  return {
    ok: true as const,
    supabase,
    room: room as {
      id: string;
      code: string;
      host_mode: HostMode;
      status: RoomStatus;
    },
  };
}
