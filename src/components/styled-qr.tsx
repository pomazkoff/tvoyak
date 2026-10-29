"use client";

import { useMemo } from "react";
import { create } from "qrcode";

const QUIET = 4;
const INK = "#1a1a1a";
const PAPER = "#F7F6F2";
const EYE = "#D7261E";

function inFinder(row: number, col: number, size: number): boolean {
  const hit = (row0: number, col0: number) =>
    row >= row0 && row <= row0 + 6 && col >= col0 && col <= col0 + 6;
  return hit(0, 0) || hit(0, size - 7) || hit(size - 7, 0);
}

function isFinderEye(row: number, col: number, size: number): boolean {
  const hit = (row0: number, col0: number) =>
    row >= row0 + 2 && row <= row0 + 4 && col >= col0 + 2 && col <= col0 + 4;
  return hit(0, 0) || hit(0, size - 7) || hit(size - 7, 0);
}

export function StyledQr({
  value,
  size = 232,
}: {
  value: string;
  size?: number;
}) {
  const modules = useMemo(() => {
    const code = create(value, { errorCorrectionLevel: "Q" });
    const count = code.modules.size;
    const dark: Array<{
      row: number;
      col: number;
      eye: boolean;
      finder: boolean;
    }> = [];
    for (let row = 0; row < count; row += 1) {
      for (let col = 0; col < count; col += 1) {
        if (!code.modules.get(row, col)) continue;
        dark.push({
          row,
          col,
          eye: isFinderEye(row, col, count),
          finder: inFinder(row, col, count),
        });
      }
    }
    return { count, dark };
  }, [value]);

  const total = modules.count + QUIET * 2;

  return (
    <svg
      className="styled-qr"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label="QR-код комнаты"
      shapeRendering="geometricPrecision"
    >
      <rect width={total} height={total} fill={PAPER} />
      {modules.dark.map((cell) => {
        const inset = cell.finder ? 0 : 0.08;
        const span = cell.finder ? 1 : 0.84;
        return (
          <rect
            key={`${cell.row}-${cell.col}`}
            x={cell.col + QUIET + inset}
            y={cell.row + QUIET + inset}
            width={span}
            height={span}
            rx={cell.finder ? 0.18 : 0.28}
            fill={cell.eye ? EYE : INK}
          />
        );
      })}
    </svg>
  );
}
