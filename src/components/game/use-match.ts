"use client";

import { useEffect, useState } from "react";
import type { BoardCell } from "@/components/game/board";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import {
  getBrowserSupabase,
  isSupabaseConfigured,
} from "@/lib/supabase/browser";
import type { PlayerRow, RoomRow } from "@/lib/supabase/types";

export type GameRow = {
  room_id: string;
  version: number;
  phase: string;
  round: number;
  current_question_id: string | null;
  buzz_winner_player_id: string | null;
  chooser_player_id: string | null;
  deadline: string | null;
  revealed_answer: string | null;
};

export type BuzzMark = {
  question_id: string;
  player_id: string;
};

export type MatchState =
  | { status: "loading" }
  | { status: "invalid" }
  | { status: "unconfigured" }
  | { status: "missing" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      room: RoomRow;
      players: PlayerRow[];
      game: GameRow;
      board: BoardCell[];
      buzzes: BuzzMark[];
    };

const gameColumns =
  "room_id, version, phase, round, current_question_id, buzz_winner_player_id, chooser_player_id, deadline, revealed_answer";

export function useMatch(code: string): MatchState {
  const [state, setState] = useState<MatchState>({ status: "loading" });

  useEffect(() => {
    const normalized = normalizeRoomCode(code);
    if (!normalized || !isSupabaseConfigured()) return;

    const supabase = getBrowserSupabase();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load(room: RoomRow) {
      const [playersResult, gameResult, boardResult, buzzResult] =
        await Promise.all([
          supabase
            .from("players")
            .select("id, nickname, role, score, joined_at")
            .eq("room_id", room.id)
            .order("joined_at", { ascending: true }),
          supabase
            .from("game_states")
            .select(gameColumns)
            .eq("room_id", room.id)
            .single(),
          supabase
            .from("question_board")
            .select(
              "id, round, category, value, row_index, col_index, status, prompt, special, assigned_player_id, revealed_answer, kind, youtube_id, vk_url, rutube_url, image_url, start_seconds, end_seconds, curtain",
            )
            .eq("room_id", room.id),
          supabase
            .from("buzzes")
            .select("question_id, player_id")
            .eq("room_id", room.id),
        ]);
      if (
        playersResult.error ||
        gameResult.error ||
        boardResult.error ||
        buzzResult.error
      ) {
        throw new Error("load");
      }
      return {
        players: (playersResult.data ?? []) as PlayerRow[],
        game: gameResult.data as GameRow,
        board: (boardResult.data ?? []) as BoardCell[],
        buzzes: (buzzResult.data ?? []) as BuzzMark[],
      };
    }

    void (async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, code, status, host_mode, host_starts_media, created_at")
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
        const snapshot = await load(room);
        if (cancelled) return;
        setState({ status: "ready", room, ...snapshot });
      } catch {
        if (!cancelled) {
          setState({
            status: "error",
            message: "Не удалось загрузить партию.",
          });
        }
        return;
      }

      const nextChannel = supabase
        .channel(`match:${room.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "players",
            filter: `room_id=eq.${room.id}`,
          },
          () => {
            void load(room)
              .then((snapshot) => {
                if (!cancelled)
                  setState({ status: "ready", room, ...snapshot });
              })
              .catch(() => undefined);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "game_states",
            filter: `room_id=eq.${room.id}`,
          },
          () => {
            void load(room)
              .then((snapshot) => {
                if (!cancelled)
                  setState({ status: "ready", room, ...snapshot });
              })
              .catch(() => undefined);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "buzzes",
            filter: `room_id=eq.${room.id}`,
          },
          () => {
            void load(room)
              .then((snapshot) => {
                if (!cancelled)
                  setState({ status: "ready", room, ...snapshot });
              })
              .catch(() => undefined);
          },
        )
        .subscribe();

      if (cancelled) void supabase.removeChannel(nextChannel);
      else channel = nextChannel;
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code]);

  useEffect(() => {
    if (state.status !== "ready" || !state.game.deadline) return;
    const normalized = normalizeRoomCode(code);
    if (!normalized || !isSupabaseConfigured()) return;
    const delay = new Date(state.game.deadline).getTime() - Date.now() + 400;
    const timer = setTimeout(
      () => {
        void getBrowserSupabase().rpc("advance_clock", { p_code: normalized });
      },
      Math.max(0, delay),
    );
    return () => clearTimeout(timer);
  }, [state, code]);

  const normalized = normalizeRoomCode(code);
  if (!normalized) return { status: "invalid" };
  if (!isSupabaseConfigured()) return { status: "unconfigured" };
  return state;
}

export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function secondsLeft(
  deadline: string | null,
  now: number,
): number | null {
  if (!deadline) return null;
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - now) / 1000));
}
