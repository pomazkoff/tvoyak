import { seededRandom } from "./random";
import type {
  EmojiSpec,
  HiddenSpec,
  PictureFormat,
  RebusPart,
  RebusSpec,
} from "./types";
import { normalizeWord } from "./rebus";

/** Эмодзи → содержимое SVG Twemoji (viewBox 0 0 36 36) или null. */
export type EmojiArt = (emoji: string) => string | null;

const FONT = "'Arial Black', 'DejaVu Sans', Arial, sans-serif";
const INK = "#1f2937";
const PAPER = "#fffaf0";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

let uid = 0;

/** Эмодзи в квадрате size×size с левым верхним углом (x, y). */
function emojiAt(
  art: EmojiArt,
  emoji: string,
  x: number,
  y: number,
  size: number,
  extra = "",
): string {
  const body = art(emoji);
  if (!body) {
    return `<text x="${x + size / 2}" y="${y + size * 0.82}" font-size="${size * 0.8}" text-anchor="middle"${extra}>${escapeXml(emoji)}</text>`;
  }
  uid += 1;
  const prefix = `e${uid}-`;
  const scoped = body
    .replace(/\bid="([^"]+)"/g, `id="${prefix}$1"`)
    .replace(/url\(#([^)]+)\)/g, `url(#${prefix}$1)`)
    .replace(/href="#([^"]+)"/g, `href="#${prefix}$1"`);
  const scale = size / 36;
  return `<g transform="translate(${x} ${y}) scale(${scale})"${extra}>${scoped}</g>`;
}

function frame(width: number, height: number, inner: string): string {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" rx="28" fill="${PAPER}"/>`,
    inner,
    `</svg>`,
  ].join("");
}

// ---- Ребус ----------------------------------------------------------------

const PIC = 180;
const LETTER = 104;
const COMMA = 40;
const GAP = 34;
const TOP = 80;
const REBUS_HEIGHT = 330;

function partWidth(part: RebusPart): number {
  if (part.t === "pic") {
    return PIC + COMMA * ((part.cutStart ?? 0) + (part.cutEnd ?? 0));
  }
  const text = part.t === "txt" ? normalizeWord(part.text) : part.text;
  return Array.from(text).length * LETTER;
}

function letters(text: string, x: number, strike: number[] = []): string {
  const out: string[] = [];
  Array.from(text).forEach((char, index) => {
    const cx = x + index * LETTER + LETTER / 2;
    out.push(
      `<text x="${cx}" y="${TOP + 160}" font-family="${FONT}" font-weight="900" font-size="170" fill="${INK}" text-anchor="middle">${escapeXml(char)}</text>`,
    );
    if (strike.includes(index)) {
      out.push(
        `<line x1="${cx - 44}" y1="${TOP + 165}" x2="${cx + 44}" y2="${TOP + 20}" stroke="#dc2626" stroke-width="14" stroke-linecap="round"/>`,
      );
    }
  });
  return out.join("");
}

function commas(count: number, x: number): string {
  return Array.from(
    { length: count },
    (_, index) =>
      `<text x="${x + index * COMMA + COMMA / 2}" y="${TOP + 40}" font-family="${FONT}" font-weight="900" font-size="120" fill="${INK}" text-anchor="middle">,</text>`,
  ).join("");
}

function drawPart(art: EmojiArt, part: RebusPart, x: number): string {
  if (part.t === "txt") {
    return letters(normalizeWord(part.text), x, part.strike);
  }
  if (part.t === "num") return letters(part.text, x);
  const before = part.cutStart ?? 0;
  const after = part.cutEnd ?? 0;
  const picX = x + before * COMMA;
  const out = [commas(before, x)];
  const flip = part.flip
    ? ` transform="rotate(180 ${picX + PIC / 2} ${TOP + PIC / 2})"`
    : "";
  out.push(
    `<g${flip}>${emojiAt(art, part.emoji, picX + 8, TOP + 8, PIC - 16)}</g>`,
  );
  out.push(commas(after, picX + PIC));
  if (part.swap?.length) {
    const label = part.swap
      .map(([from, to]) => `${normalizeWord(from)}=${normalizeWord(to)}`)
      .join(" ");
    out.push(
      `<text x="${picX + PIC / 2}" y="${TOP - 16}" font-family="${FONT}" font-weight="900" font-size="58" fill="${INK}" text-anchor="middle">${escapeXml(label)}</text>`,
    );
  }
  return out.join("");
}

export function renderRebus(spec: RebusSpec, art: EmojiArt): string {
  const pad = 48;
  let x = pad;
  const out: string[] = [];
  spec.parts.forEach((part, index) => {
    if (index > 0) x += GAP;
    out.push(drawPart(art, part, x));
    x += partWidth(part);
  });
  return frame(x + pad, REBUS_HEIGHT, out.join(""));
}

// ---- Эмодзи-шифр -------------------------------------------------------

export function renderEmoji(spec: EmojiSpec, art: EmojiArt): string {
  const size = 170;
  const gap = 30;
  const pad = 50;
  const widths = spec.lines.map(
    (line) => line.length * size + (line.length - 1) * gap,
  );
  const width = Math.max(...widths) + pad * 2;
  const height = spec.lines.length * (size + gap) - gap + pad * 2;
  const out: string[] = [];
  spec.lines.forEach((line, row) => {
    const start = (width - widths[row]) / 2;
    line.forEach((emoji, column) => {
      out.push(
        emojiAt(
          art,
          emoji,
          start + column * (size + gap),
          pad + row * (size + gap),
          size,
        ),
      );
    });
  });
  return frame(width, height, out.join(""));
}

// ---- Найди лишнее ------------------------------------------------------

export function oddIndex(spec: HiddenSpec): number {
  const random = seededRandom(spec.seed);
  const total = spec.cols * spec.rows;
  // Не у самого края: так честнее искать.
  const inner: number[] = [];
  for (let index = 0; index < total; index += 1) {
    const col = index % spec.cols;
    const row = Math.floor(index / spec.cols);
    if (col > 0 && col < spec.cols - 1 && row > 0 && row < spec.rows - 1) {
      inner.push(index);
    }
  }
  const pool = inner.length
    ? inner
    : Array.from({ length: total }, (_, i) => i);
  return pool[Math.floor(random() * pool.length)];
}

export function renderHidden(spec: HiddenSpec, art: EmojiArt): string {
  const cell = 96;
  const size = 76;
  const pad = 30;
  const random = seededRandom(spec.seed * 7 + 3);
  const odd = oddIndex(spec);
  const out: string[] = [];
  for (let index = 0; index < spec.cols * spec.rows; index += 1) {
    const col = index % spec.cols;
    const row = Math.floor(index / spec.cols);
    const angle = Math.round((random() - 0.5) * 50);
    const dx = (random() - 0.5) * 12;
    const dy = (random() - 0.5) * 12;
    const x = pad + col * cell + (cell - size) / 2 + dx;
    const y = pad + row * cell + (cell - size) / 2 + dy;
    const rotate = ` transform="rotate(${angle} ${x + size / 2} ${y + size / 2})"`;
    out.push(
      `<g${rotate}>${emojiAt(art, index === odd ? spec.odd : spec.base, x, y, size)}</g>`,
    );
  }
  return frame(
    spec.cols * cell + pad * 2,
    spec.rows * cell + pad * 2,
    out.join(""),
  );
}

/** Все эмодзи, которые нужны для картинки. */
export function emojisOf(format: PictureFormat, spec: unknown): string[] {
  if (format === "rebus") {
    return ((spec as RebusSpec).parts ?? [])
      .filter(
        (part): part is Extract<RebusPart, { t: "pic" }> => part.t === "pic",
      )
      .map((part) => part.emoji);
  }
  if (format === "emoji") return ((spec as EmojiSpec).lines ?? []).flat();
  if (format === "hidden") {
    const hidden = spec as HiddenSpec;
    return [hidden.base, hidden.odd];
  }
  return [];
}

export function renderPicture(
  format: PictureFormat,
  spec: unknown,
  art: EmojiArt,
): string | null {
  if (format === "rebus") return renderRebus(spec as RebusSpec, art);
  if (format === "emoji") return renderEmoji(spec as EmojiSpec, art);
  if (format === "hidden") return renderHidden(spec as HiddenSpec, art);
  return null;
}
