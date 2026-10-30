"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardCell } from "@/components/game/board";
import {
  CLOCK_MAX_ATTEMPTS,
  clockDueAt,
  clockKey,
  clockRetryDelay,
} from "@/lib/game/clock";
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
  updated_at: string | null;
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
  "room_id, version, phase, round, current_question_id, buzz_winner_player_id, chooser_player_id, deadline, revealed_answer, updated_at";

/** Попросить все открытые экраны партии перечитать состояние сейчас. */
export function requestMatchReload(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(MATCH_RELOAD_EVENT));
}

const MATCH_RELOAD_EVENT = "tvoyak:match-reload";
const POLL_MS = 3000;

export function useMatch(code: string): MatchState {
  const [state, setState] = useState<MatchState>({ status: "loading" });
  const reloadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const normalized = normalizeRoomCode(code);
    if (!normalized || !isSupabaseConfigured()) return;

    const supabase = getBrowserSupabase();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let roomId: string | null = null;
    // Ответы могут прийти не по порядку: применяем только самый свежий
    // запрос и никогда не откатываем версию партии назад.
    let requested = 0;
    let applied = 0;
    let shownVersion = -1;
    let ready = false;
    let lastFingerprint = "";

    async function readRoom(): Promise<RoomRow | null | "error"> {
      const { data, error } = await supabase
        .from("rooms")
        .select(
          "id, code, status, host_mode, host_starts_media, host_phone, host_voice, created_at",
        )
        .eq("code", normalized)
        .maybeSingle();
      if (error) return "error";
      return (data as RoomRow | null) ?? null;
    }

    async function load(room: RoomRow) {
      const [playersResult, gameResult, boardResult, buzzResult] =
        await Promise.all([
          supabase
            .from("players")
            .select("id, nickname, role, score, joined_at, remote")
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
              "id, round, category, value, row_index, col_index, status, prompt, special, assigned_player_id, revealed_answer, kind, youtube_id, vk_url, rutube_url, image_url, audio_url, audio_fx, start_seconds, end_seconds, vk_start_seconds, vk_end_seconds, curtain, picture, picture_fx, reveal_seconds, opened_at, media_started_at, image_license, image_credit, image_page",
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

    // Каждый раз перечитываем и комнату (статус, режим ведущего, «трек
    // включает ведущий»), и партию целиком.
    async function refresh() {
      const ticket = ++requested;
      const room = await readRoom();
      if (cancelled) return;
      if (room === "error" || room === null) {
        if (!ready && ticket > applied) {
          applied = ticket;
          setState(
            room === null
              ? { status: "missing" }
              : { status: "error", message: "Не удалось прочитать комнату." },
          );
        }
        return;
      }
      let snapshot: Awaited<ReturnType<typeof load>>;
      try {
        snapshot = await load(room);
      } catch {
        if (!cancelled && !ready && ticket > applied) {
          applied = ticket;
          setState({
            status: "error",
            message: "Не удалось загрузить партию.",
          });
        }
        return;
      }
      if (cancelled || ticket < applied) return;
      if (snapshot.game.version < shownVersion) return;
      applied = ticket;
      shownVersion = snapshot.game.version;
      ready = true;
      // Опрос каждые 3 с: без изменений не перерисовываем экраны.
      const fingerprint = JSON.stringify([room, snapshot]);
      if (fingerprint === lastFingerprint) return;
      lastFingerprint = fingerprint;
      setState({ status: "ready", room, ...snapshot });
      if (!roomId) {
        roomId = room.id;
        subscribe(room.id);
      }
    }

    function subscribe(id: string) {
      const onChange = () => void refresh().catch(() => undefined);
      const nextChannel = supabase.channel(`match:${id}`);
      for (const table of ["players", "game_states", "buzzes"]) {
        nextChannel.on(
          "postgres_changes",
          { event: "*", schema: "public", table, filter: `room_id=eq.${id}` },
          onChange,
        );
      }
      nextChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` },
        onChange,
      );
      // После переподключения сокета могли пропустить события — перечитываем.
      nextChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") onChange();
      });
      if (cancelled) void supabase.removeChannel(nextChannel);
      else channel = nextChannel;
    }

    reloadRef.current = refresh;
    void refresh().catch(() => undefined);

    // Страховка, если realtime не доставил событие или сокет уснул.
    const poll = setInterval(() => {
      void refresh().catch(() => undefined);
    }, POLL_MS);
    const onWake = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => undefined);
    };
    const onRequest = () => void refresh().catch(() => undefined);
    window.addEventListener(MATCH_RELOAD_EVENT, onRequest);
    window.addEventListener("focus", onRequest);
    window.addEventListener("online", onRequest);
    document.addEventListener("visibilitychange", onWake);

    return () => {
      cancelled = true;
      clearInterval(poll);
      window.removeEventListener(MATCH_RELOAD_EVENT, onRequest);
      window.removeEventListener("focus", onRequest);
      window.removeEventListener("online", onRequest);
      document.removeEventListener("visibilitychange", onWake);
      reloadRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [code]);

  // Серверные сроки: когда локальный таймер дошёл до нуля, просим сервер
  // сдвинуть партию (advance_clock идемпотентна и сверяет версию), потом
  // перечитываем состояние. Пока версия та же — повторяем с растущей паузой:
  // это спасает от сна вкладки, потерянного realtime и расхождения часов.
  const clockGame = state.status === "ready" ? state.game : null;
  const clockId = clockGame ? clockKey(clockGame) : null;
  const clockMode = state.status === "ready" ? state.room.host_mode : undefined;
  const clockDue = clockGame ? clockDueAt(clockGame, clockMode) : null;
  const clockVersion = clockGame?.version ?? null;
  useEffect(() => {
    if (clockId === null || clockDue === null || clockVersion === null) return;
    const normalized = normalizeRoomCode(code);
    if (!normalized || !isSupabaseConfigured()) return;
    let attempt = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function fire() {
      if (stopped) return;
      try {
        await getBrowserSupabase().rpc("advance_clock", {
          p_code: normalized,
          p_version: clockVersion,
        });
        await reloadRef.current?.();
      } catch {
        // Сеть мигнула — попробуем ещё раз.
      }
      if (stopped) return;
      attempt += 1;
      if (attempt < CLOCK_MAX_ATTEMPTS) {
        timer = setTimeout(() => void fire(), clockRetryDelay(attempt - 1));
      }
    }

    timer = setTimeout(() => void fire(), Math.max(0, clockDue - Date.now()));
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [clockId, clockDue, clockVersion, code]);

  // Финал у бота: сервер проверяет ответы сам (fuzzy + LLM), даже если
  // телевизор закрыт. Просим об этом один раз на версию партии.
  const settleVersion =
    clockGame &&
    clockMode === "bot" &&
    clockGame.phase === "judging" &&
    clockGame.round === 3
      ? clockGame.version
      : null;
  useEffect(() => {
    if (settleVersion === null) return;
    const normalized = normalizeRoomCode(code);
    if (!normalized) return;
    // Небольшой разброс, чтобы все телефоны не стучались разом.
    const timer = setTimeout(
      () => {
        void fetch("/api/play/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: normalized }),
        })
          .catch(() => undefined)
          .finally(() => void reloadRef.current?.());
      },
      Math.floor(Math.random() * 1200),
    );
    return () => clearTimeout(timer);
  }, [settleVersion, code]);

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
