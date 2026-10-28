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
};

export function ScoreStrip({ players }: { players: PlayerRow[] }) {
  const table = players
    .filter((player) => player.role === "player")
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
            className={`font-mono text-lg ${player.score < 0 ? "text-danger" : "text-gold"}`}
          >
            {player.score}
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
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {columns.map((column, index) => (
        <div key={column[0]?.category ?? index} className="grid gap-2">
          <p className="flex min-h-12 items-center justify-center text-center text-xs font-semibold text-gold sm:text-sm">
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
                className={`h-14 rounded-xl border text-lg font-semibold ${
                  spent
                    ? "border-transparent bg-navy/40 text-muted"
                    : "border-line bg-[#1d4e89] text-ink hover:border-gold"
                } disabled:cursor-default`}
              >
                {spent ? "" : cell.value}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
