"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardCell } from "@/components/game/board";
import {
  blurPx,
  openTileSet,
  pixelBlocks,
  pixelSteps,
  revealProgress,
  zoomScale,
} from "@/lib/pictures/reveal";
import { TWEMOJI_CREDIT } from "@/lib/pictures/twemoji";
import {
  GENERATED_FORMATS,
  KIDS_CREDIT,
  PICTURE_TITLE,
  isPictureFormat,
  type PictureFx,
} from "@/lib/pictures/types";

/** Смещение серверных часов: картинка раскрывается от opened_at на сервере. */
let offsetPromise: Promise<number> | null = null;

function serverOffset(): Promise<number> {
  if (!offsetPromise) {
    const started = Date.now();
    offsetPromise = fetch("/api/time", { cache: "no-store" })
      .then((response) => response.json() as Promise<{ now?: number }>)
      .then((body) => {
        const finished = Date.now();
        if (typeof body.now !== "number") return 0;
        return body.now - (started + finished) / 2;
      })
      .catch(() => 0);
  }
  return offsetPromise;
}

function useRevealProgress(cell: BoardCell, revealed: boolean): number {
  const [progress, setProgress] = useState(0);
  const animated = !revealed && Boolean(cell.reveal_seconds);
  useEffect(() => {
    if (!animated) return;
    let frame = 0;
    let offset = 0;
    let cancelled = false;
    void serverOffset().then((value) => {
      offset = value;
    });
    const tick = () => {
      if (cancelled) return;
      const next = revealProgress(
        cell.opened_at,
        cell.reveal_seconds,
        Date.now() + offset,
      );
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [animated, cell.opened_at, cell.reveal_seconds]);
  return animated ? progress : 1;
}

/**
 * Уменьшение половинками: каждый «пиксель» — среднее цвета своего квадрата,
 * а не случайная точка (при сжатии 960 → 8 за один шаг цвета «скачут»).
 */
function averaged(
  image: HTMLImageElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  let source: CanvasImageSource = image;
  let w = image.naturalWidth;
  let h = image.naturalHeight;
  let canvas = document.createElement("canvas");
  while (w / 2 >= width && h / 2 >= height) {
    w = Math.max(width, Math.floor(w / 2));
    h = Math.max(height, Math.floor(h / 2));
    const next = document.createElement("canvas");
    next.width = w;
    next.height = h;
    const context = next.getContext("2d");
    if (!context) break;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source, 0, 0, w, h);
    source = next;
    canvas = next;
  }
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const context = out.getContext("2d");
  if (context) {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(source === image ? image : canvas, 0, 0, width, height);
  }
  return out;
}

/** Пикселизация на canvas: уменьшаем и растягиваем без сглаживания. */
function PixelCanvas({
  src,
  progress,
  start,
}: {
  src: string;
  progress: number;
  /** «Один пиксель»: ступени start → 2·start → … вместо плавного прояснения. */
  start?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const element = new Image();
    element.decoding = "async";
    element.onload = () => setImage(element);
    element.src = src;
    return () => {
      element.onload = null;
    };
  }, [src]);

  const blocks = start ? pixelSteps(progress, start) : pixelBlocks(progress);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return;
    if (!blocks) {
      context.imageSmoothingEnabled = true;
      context.drawImage(image, 0, 0, width, height);
      return;
    }
    // «Один пиксель»: сетка по длинной стороне (8×8 — 8 «пикселей» по ней);
    // размытое фото — как раньше, по ширине.
    const long = start ? Math.max(width, height) : width;
    const small = Math.max(1, Math.round((blocks * width) / long));
    const smallHeight = Math.max(1, Math.round((blocks * height) / long));
    const buffer = start
      ? averaged(image, small, smallHeight)
      : document.createElement("canvas");
    if (!start) {
      buffer.width = small;
      buffer.height = smallHeight;
      const bufferContext = buffer.getContext("2d");
      if (!bufferContext) return;
      bufferContext.drawImage(image, 0, 0, small, smallHeight);
    }
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, width, height);
    context.drawImage(buffer, 0, 0, small, smallHeight, 0, 0, width, height);
  }, [image, blocks, start]);

  return (
    <canvas
      ref={canvasRef}
      className="picture-media"
      aria-label="Картинка проясняется"
    />
  );
}

function Tiles({ fx, progress }: { fx: PictureFx; progress: number }) {
  const cols = fx.cols ?? 4;
  const rows = fx.rows ?? 3;
  const open = openTileSet(progress, cols, rows, fx.seed ?? 1);
  if (progress >= 1) return null;
  return (
    <div
      className="picture-tiles"
      style={{
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
      }}
      aria-hidden
    >
      {Array.from({ length: cols * rows }, (_, index) => (
        <span
          key={index}
          className={`picture-tile ${open.has(index) ? "is-open" : ""}`}
        >
          {open.has(index) ? null : index + 1}
        </span>
      ))}
    </div>
  );
}

/**
 * Картиночное задание на экране ведущего. На телефоны картинка не уходит:
 * там «Смотрите экран ведущего».
 */
export function PictureTask({
  cell,
  revealed,
}: {
  cell: BoardCell;
  revealed: boolean;
}) {
  const progress = useRevealProgress(cell, revealed);
  if (!isPictureFormat(cell.picture) || !cell.image_url) return null;
  const format = cell.picture;
  const fx: PictureFx = (cell.picture_fx ?? {}) as PictureFx;
  const generated = GENERATED_FORMATS.includes(format);
  const src = cell.image_url;

  let effect: "none" | "blur" | "pixel" | "tiles" | "zoom" = "none";
  if (format === "blur") effect = fx.effect === "pixel" ? "pixel" : "blur";
  if (format === "fragment") effect = fx.mode === "zoom" ? "zoom" : "tiles";
  if (format === "logo") {
    effect =
      fx.effect === "blur" ? "blur" : fx.effect === "tiles" ? "tiles" : "none";
  }
  if (format === "kids" && fx.effect === "blur") effect = "blur";
  if (format === "pixel") effect = "pixel";
  if (format === "macro") effect = "zoom";
  if (progress >= 1) effect = "none";

  const imageStyle: React.CSSProperties = {};
  if (effect === "blur") {
    // Детский рисунок проявляется легко: его и так непросто узнать.
    const max = format === "kids" ? 14 : undefined;
    imageStyle.filter = `blur(${blurPx(progress, max)}px)`;
  }
  if (effect === "zoom") {
    const [fxX, fxY] = fx.focus ?? [0.5, 0.5];
    const scale = fx.scale ?? (format === "macro" ? 8 : 6);
    imageStyle.transform = `scale(${zoomScale(progress, scale)})`;
    imageStyle.transformOrigin = `${fxX * 100}% ${fxY * 100}%`;
  }

  const credit = generated
    ? TWEMOJI_CREDIT
    : format === "kids"
      ? KIDS_CREDIT
      : revealed && cell.image_credit
        ? cell.image_credit
        : cell.image_license
          ? `${cell.image_license} · Wikimedia Commons (автор — после ответа)`
          : null;

  return (
    <figure
      className={`picture-task picture-${format} ${generated ? "is-generated" : ""}`}
      data-picture={format}
      data-progress={progress.toFixed(2)}
    >
      <p className="picture-kind hand">{PICTURE_TITLE[format]}</p>
      <div
        className="picture-frame"
        style={fx.background ? { background: fx.background } : undefined}
      >
        {effect === "pixel" ? (
          <PixelCanvas
            src={src}
            progress={progress}
            start={format === "pixel" ? (fx.blocks === 16 ? 16 : 8) : undefined}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="picture-media" style={imageStyle} />
        )}
        {effect === "tiles" ? <Tiles fx={fx} progress={progress} /> : null}
        {!revealed && progress < 1 ? (
          <span className="picture-progress" aria-hidden>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        ) : null}
      </div>
      {credit ? (
        <figcaption className="picture-credit">
          {credit}
          {revealed && cell.image_page ? (
            <>
              {" · "}
              <a href={cell.image_page} target="_blank" rel="noreferrer">
                страница файла
              </a>
            </>
          ) : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
