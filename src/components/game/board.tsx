"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  start_seconds: number | null;
  end_seconds: number | null;
  curtain: boolean;
};

export function ScoreStrip({ players }: { players: PlayerRow[] }) {
  const table = scoreboardPlayers(players)
    .slice()
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.nickname.localeCompare(right.nickname, "ru"),
    );

  return (
    <ul className="flex gap-2 overflow-x-auto pb-1">
      {table.map((player) => (
        <li
          key={player.id}
          className="min-w-28 rounded-2xl border border-line bg-panel px-3 py-2"
        >
          <p className="truncate text-sm">{player.nickname}</p>
          <p
            className={`text-2xl font-semibold tabular-nums ${player.score < 0 ? "text-danger" : "text-ink"}`}
          >
            <CountUp value={player.score} />
          </p>
        </li>
      ))}
    </ul>
  );
}

export function Board({
  cells,
  round,
  canPick,
  onPick,
}: {
  cells: BoardCell[];
  round: number;
  canPick: boolean;
  onPick?: (cell: BoardCell) => void;
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
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6 sm:gap-2">
      {columns.map((column, index) => (
        <div
          key={column[0]?.category ?? index}
          className="grid gap-1.5 sm:gap-2"
        >
          <p className="flex min-h-12 items-end justify-center px-1 pb-1 text-center text-[11px] tracking-[0.14em] text-muted uppercase sm:min-h-14 sm:text-xs">
            {column[0]?.category ?? ""}
          </p>
          {column.map((cell) => {
            const spent = cell.status === "answered";
            return (
              <button
                key={cell.id}
                type="button"
                disabled={!canPick || spent}
                onClick={() => onPick?.(cell)}
                className="cell h-16 border border-line bg-[#1c1c1c] text-xl font-semibold text-ink hover:border-[#c4c4c4] disabled:cursor-default sm:h-20 sm:text-2xl lg:h-24 lg:text-3xl"
              >
                <span className={`cell-inner ${spent ? "is-spent" : ""}`}>
                  <span className="cell-face cell-front">{cell.value}</span>
                  <span className="cell-face cell-back text-muted">—</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
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
