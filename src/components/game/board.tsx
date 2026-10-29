"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Strike } from "@/components/marks";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import type { PlayerRow } from "@/lib/supabase/types";

export type BoardCell = {
  id: string;
  round: number;
  category: string;
  value: number;
  row_index: number;
  col_index: number;
  status: "hidden" | "open" | "answered";
  prompt: string | null;
  special: string | null;
  assigned_player_id: string | null;
  revealed_answer: string | null;
  kind: "text" | "image" | "video" | "music";
  youtube_id: string | null;
  vk_url: string | null;
  rutube_url: string | null;
  image_url: string | null;
  /** Превью трека (iTunes) для музыкальных вопросов без видео. */
  audio_url?: string | null;
  start_seconds: number | null;
  end_seconds: number | null;
  /** Свой фрагмент для VK-копии (если не совпадает с YouTube). */
  vk_start_seconds?: number | null;
  vk_end_seconds?: number | null;
  curtain: boolean;
  /** Картиночное задание: rebus | emoji | fragment | hidden | blur | logo. */
  picture?: string | null;
  /** Как раскрывать картинку (без содержимого, оно выдало бы ответ). */
  picture_fx?: Record<string, unknown> | null;
  reveal_seconds?: number | null;
  opened_at?: string | null;
  image_license?: string | null;
  /** Автор и страница файла — только после ответа. */
  image_credit?: string | null;
  image_page?: string | null;
};

const COL_TILT = [-0.8, 1.1, -1.4, 0.7, -1.2, 1.5];

export function Board({
  cells,
  round,
  canPick,
  onPick,
  onRefuse,
  activeId,
}: {
  cells: BoardCell[];
  round: number;
  canPick: boolean;
  onPick?: (cell: BoardCell) => void;
  onRefuse?: () => void;
  activeId?: string | null;
}) {
  const roundCells = cells.filter(
    (cell) => cell.round === round && cell.round !== 3,
  );
  const columns = Array.from({ length: 6 }, (_, col) =>
    roundCells
      .filter((cell) => cell.col_index === col)
      .sort((left, right) => left.row_index - right.row_index),
  );

  return (
    <div className="board-grid">
      {columns.map((column, index) => (
        <div
          key={column[0]?.category ?? index}
          className="paper-col"
          style={{ transform: `rotate(${COL_TILT[index]}deg)` }}
        >
          <p className="tape cat-tape poster">{column[0]?.category ?? ""}</p>
          {column.map((cell) => {
            const spent = cell.status === "answered";
            return (
              <button
                key={cell.id}
                type="button"
                disabled={spent}
                aria-disabled={!canPick || spent}
                onClick={() => {
                  if (spent) return;
                  if (!canPick) {
                    onRefuse?.();
                    return;
                  }
                  onPick?.(cell);
                }}
                className={`nominal poster ${spent ? "is-spent" : ""} ${cell.id === activeId ? "is-open" : ""}`}
              >
                {cell.value}
                <span className="hover-ring" />
                {spent ? <Strike /> : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function PlayerRail({
  players,
  activeId,
  note,
}: {
  players: PlayerRow[];
  activeId?: string | null;
  note?: string;
}) {
  const table = scoreboardPlayers(players);
  return (
    <div className="player-rail">
      {table.map((player, index) => {
        const active = player.id === activeId;
        return (
          <div key={player.id} className="player-chip">
            {active ? (
              <svg
                className="hand-ring"
                viewBox="0 0 220 110"
                preserveAspectRatio="none"
                aria-hidden
              >
                <ellipse cx="110" cy="58" rx="100" ry="46" />
              </svg>
            ) : null}
            <p
              className="tape hand"
              style={{ transform: `rotate(${index % 2 ? 3 : -4}deg)` }}
            >
              {player.nickname}
            </p>
            <p
              className={`poster score ${player.score < 0 ? "text-danger" : ""}`}
            >
              <CountUp value={player.score} />
            </p>
            {active && note ? <p className="hand text-danger">{note}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function CountUp({ value }: { value: number }) {
  const reduced = useSyncExternalStore(
    (onStoreChange) => {
      const query = window.matchMedia("(prefers-reduced-motion: reduce)");
      query.addEventListener("change", onStoreChange);
      return () => query.removeEventListener("change", onStoreChange);
    },
    prefersReducedMotion,
    () => false,
  );
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);

  useEffect(() => {
    if (reduced || fromRef.current === value) return;
    const from = fromRef.current;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 480);
      const eased = 1 - (1 - progress) ** 3;
      setShown(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, value]);

  return <>{reduced ? value : shown}</>;
}
