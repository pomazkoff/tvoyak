import { seededOrder } from "./random";

/** Доля раскрытия 0..1 по серверному времени. */
export function revealProgress(
  openedAt: string | null | undefined,
  revealSeconds: number | null | undefined,
  serverNow: number,
): number {
  if (!revealSeconds || revealSeconds <= 0) return 1;
  if (!openedAt) return 0;
  const started = Date.parse(openedAt);
  if (Number.isNaN(started)) return 1;
  const value = (serverNow - started) / (revealSeconds * 1000);
  return Math.min(1, Math.max(0, value));
}

/** Размытие в пикселях: сначала сильно, к концу резко. */
export function blurPx(progress: number, max = 36): number {
  return Math.round(max * Math.pow(1 - progress, 1.4) * 10) / 10;
}

/** Размер «пикселя» (доля ширины): от 1/8 картинки до исходного. */
export function pixelBlocks(progress: number): number {
  // Сколько блоков по ширине: 6 → 320 (дальше уже не видно разницы).
  const blocks = 6 * Math.pow(320 / 6, Math.pow(progress, 1.2));
  return progress >= 1 ? 0 : Math.round(blocks);
}

/** Сколько плиток уже открыто: первая — сразу, последняя — к концу. */
export function openTiles(progress: number, total: number): number {
  if (progress >= 1) return total;
  return Math.min(total, 1 + Math.floor(progress * (total - 1)));
}

/** Какие плитки открыты (по индексам). */
export function openTileSet(
  progress: number,
  cols: number,
  rows: number,
  seed: number,
): Set<number> {
  const total = cols * rows;
  const order = seededOrder(total, seed);
  return new Set(order.slice(0, openTiles(progress, total)));
}

/** Увеличение для zoom: от scale к 1 по экспоненте — отъезд выглядит ровно. */
export function zoomScale(progress: number, scale = 6): number {
  if (progress >= 1) return 1;
  return Math.pow(scale, 1 - progress);
}

/**
 * «Один пиксель»: сетка растёт ступенями, а не плавно — сначала держится
 * start (8 или 16 «пикселей» по длинной стороне), потом мельчает примерно
 * в полтора раза на ступень и не доходит до почти резкой картинки:
 * 8 → 12 → 16 → 24 → 32, 16 → 24 → 32 → 48 → 64. Целиком — только в конце.
 * 0 — картинка целиком.
 */
export function pixelSteps(progress: number, start = 8): number {
  if (progress >= 1) return 0;
  const steps = [1, 1.5, 2, 3, 4].map((k) => Math.round(start * k));
  const index = Math.min(
    steps.length - 1,
    Math.floor(Math.max(0, progress) * steps.length),
  );
  return steps[index]!;
}

/**
 * С какого момента (серверное время, мс) раскрывать картинку: не раньше,
 * чем она загрузилась на экране ведущего, — иначе медленная картинка
 * появляется уже почти резкой.
 */
export function revealStart(
  openedAt: string | null | undefined,
  loadedAt: number,
): number {
  const opened = openedAt ? Date.parse(openedAt) : Number.NaN;
  return Number.isNaN(opened) ? loadedAt : Math.max(opened, loadedAt);
}
