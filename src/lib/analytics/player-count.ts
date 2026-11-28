import { getBrowserSupabase } from "@/lib/supabase/browser";

/** Сколько игроков сейчас в комнате. Зрители не считаются. */
export async function countRoomPlayers(
  roomId: string,
): Promise<number | undefined> {
  try {
    const { count, error } = await getBrowserSupabase()
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomId)
      .eq("role", "player");
    if (error || typeof count !== "number") return undefined;
    return count;
  } catch {
    return undefined;
  }
}
