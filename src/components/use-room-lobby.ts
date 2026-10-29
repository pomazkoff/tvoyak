"use client";

import { useEffect, useState } from "react";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";
import type { PlayerRow, RoomRow } from "@/lib/supabase/types";

export type LobbyState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "unconfigured" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | { status: "ready"; room: RoomRow; players: PlayerRow[] };

export function useRoomLobby(code: string): LobbyState {
  const [state, setState] = useState<LobbyState>({ status: "loading" });

  useEffect(() => {
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      return;
    }
    if (!isSupabaseConfigured()) {
      return;
    }

    const supabase = getBrowserSupabase();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let poll: ReturnType<typeof setInterval> | undefined;

    async function loadPlayers(roomId: string): Promise<PlayerRow[]> {
      const { data, error } = await supabase
        .from("players")
        .select("id, nickname, role, score, joined_at")
        .eq("room_id", roomId)
        .order("joined_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlayerRow[];
    }

    void (async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, code, status, host_mode, created_at")
        .eq("code", normalized)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setState({ status: "error", message: "Не удалось прочитать комнату." });
        return;
      }
      if (!data) {
        setState({ status: "missing" });
        return;
      }

      const room = data as RoomRow;
      try {
        const players = await loadPlayers(room.id);
        if (cancelled) return;
        setState({ status: "ready", room, players });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Не удалось загрузить игроков.",
          });
        }
        return;
      }

      const nextChannel = supabase
        .channel(`room-players:${room.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "players",
            filter: `room_id=eq.${room.id}`,
          },
          () => {
            void loadPlayers(room.id)
              .then((players) => {
                if (!cancelled) setState({ status: "ready", room, players });
              })
              .catch(() => {
                // Оставляем последний удачный список.
              });
          },
        )
        .subscribe();

      // Страховка, если realtime не доставил событие: опрашиваем список.
      poll = setInterval(() => {
        void loadPlayers(room.id)
          .then((players) => {
            if (!cancelled) setState({ status: "ready", room, players });
          })
          .catch(() => undefined);
      }, 3000);

      if (cancelled) {
        void supabase.removeChannel(nextChannel);
      } else {
        channel = nextChannel;
      }
    })();

    return () => {
      cancelled = true;
      if (poll) clearInterval(poll);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code]);

  const normalized = normalizeRoomCode(code);
  if (!normalized) return { status: "invalid" };
  if (!isSupabaseConfigured()) return { status: "unconfigured" };
  return state;
}
