/**
 * Картиночные задания. Хранятся как kind = 'image' с дополнительными полями
 * picture (формат) и picture_spec (как собрать или как раскрывать картинку).
 */
export const PICTURE_FORMATS = [
  "rebus",
  "emoji",
  "fragment",
  "hidden",
  "blur",
  "logo",
  "kids",
  "pixel",
  "macro",
] as const;

export type PictureFormat = (typeof PICTURE_FORMATS)[number];

export function isPictureFormat(value: unknown): value is PictureFormat {
  return (
    typeof value === "string" &&
    (PICTURE_FORMATS as readonly string[]).includes(value)
  );
}

/** Темы на табло для каждого формата. */
export const PICTURE_CATEGORY: Record<PictureFormat, string> = {
  rebus: "Ребусы",
  emoji: "Эмодзи-шифр",
  fragment: "По фрагменту",
  hidden: "Найди лишнее",
  blur: "Размытое фото",
  logo: "Логотипы",
  kids: "Детский рисунок",
  pixel: "Один пиксель",
  macro: "Супер-зум",
};

export const PICTURE_TITLE: Record<PictureFormat, string> = {
  rebus: "Ребус",
  emoji: "Эмодзи-шифр",
  fragment: "Угадай по фрагменту",
  hidden: "Найди лишнее",
  blur: "Размытая картинка",
  logo: "Логотип без названия",
  kids: "Детский рисунок: что за фильм?",
  pixel: "Один пиксель: что на картинке?",
  macro: "Супер-зум: что это?",
};

/** Картинка собирается сервером в SVG — внешний файл не нужен. */
export const GENERATED_FORMATS: readonly PictureFormat[] = [
  "rebus",
  "emoji",
  "hidden",
];

/** Сколько секунд раскрывается картинка по умолчанию (0 — сразу целиком). */
export const DEFAULT_REVEAL: Record<PictureFormat, number> = {
  rebus: 0,
  emoji: 0,
  fragment: 20,
  hidden: 0,
  blur: 18,
  logo: 12,
  kids: 10,
  pixel: 24,
  macro: 20,
};

/**
 * «Детский рисунок»: рисунки нарисованы ИИ и лежат в public/pictures/k/
 * под случайными именами (имя файла не выдаёт ответ).
 */
export const KIDS_CREDIT = "Рисунок нарисован ИИ для «Твояка»";

/** Кнопка «Ответ» не закрывается раньше, чем через столько секунд после раскрытия. */
export const BUZZ_AFTER_REVEAL_SECONDS = 6;

// ---- Ребус ----------------------------------------------------------------

/** Картинка: слово, которое она изображает, и что с ним сделать. */
export type RebusPic = {
  t: "pic";
  emoji: string;
  word: string;
  /** Запятые слева: столько первых букв убрать. */
  cutStart?: number;
  /** Запятые справа: столько последних букв убрать. */
  cutEnd?: number;
  /** Замены букв «К=Р»: [из, в]. */
  swap?: Array<[string, string]>;
  /** Картинка вверх ногами — слово читается задом наперёд. */
  flip?: boolean;
};

/** Буквы; зачёркнутые (по индексу) не читаются. */
export type RebusText = { t: "txt"; text: string; strike?: number[] };

/** Число: рисуется цифрами, читается словом («100» → «сто»). */
export type RebusNum = { t: "num"; text: string; word: string };

export type RebusPart = RebusPic | RebusText | RebusNum;

export type RebusSpec = { parts: RebusPart[] };

// ---- Эмодзи-шифр --------------------------------------------------------

/** Строки эмодзи (каждый элемент — один эмодзи). */
export type EmojiSpec = { lines: string[][] };

// ---- Найди лишнее ------------------------------------------------------

export type HiddenSpec = {
  base: string;
  odd: string;
  cols: number;
  rows: number;
  seed: number;
};

// ---- Фото: фрагмент, размытие, логотип -----------------------------------

export type FragmentSpec = {
  /** tiles — плитки открываются по одной; zoom — камера отъезжает от детали. */
  mode: "tiles" | "zoom";
  cols?: number;
  rows?: number;
  seed?: number;
  /** Точка, с которой начинается zoom (доли 0..1). */
  focus?: [number, number];
  /** Начальное увеличение для zoom. */
  scale?: number;
};

export type BlurSpec = {
  effect: "blur" | "pixel";
};

export type LogoSpec = {
  /** none — сразу целиком; blur — проявляется из размытия; tiles — по плиткам. */
  effect: "none" | "blur" | "tiles";
  /** Белый фон под прозрачным логотипом. */
  background?: string;
  /** «Один пиксель»: стартовая сетка. */
  blocks?: number;
};

// ---- Детский рисунок ----------------------------------------------------

export type KidsSpec = {
  /** none — сразу целиком; blur — лёгкое проявление из размытия. */
  effect: "none" | "blur";
};

// ---- Один пиксель ------------------------------------------------------

/**
 * Картинка сжата до blocks×blocks (8 или 16) и проясняется ступенями:
 * 8 → 16 → 32 → 64 → целиком.
 */
export type PixelSpec = {
  effect: "pixel";
  /** С какой сетки начинать: 8 (труднее) или 16. */
  blocks?: 8 | 16;
};

// ---- Супер-зум ---------------------------------------------------------

/** Макро/микроскоп: камера отъезжает от детали (как fragment/zoom). */
export type MacroSpec = {
  mode: "zoom";
  focus: [number, number];
  scale: number;
};

export type PictureSpec =
  | RebusSpec
  | EmojiSpec
  | HiddenSpec
  | FragmentSpec
  | BlurSpec
  | LogoSpec
  | KidsSpec
  | PixelSpec
  | MacroSpec;

/** Что видит экран ведущего: picture_spec без «содержимого» (оно выдало бы ответ). */
export type PictureFx = {
  mode?: FragmentSpec["mode"];
  cols?: number;
  rows?: number;
  seed?: number;
  focus?: [number, number];
  scale?: number;
  effect?: BlurSpec["effect"] | LogoSpec["effect"];
  background?: string;
  /** «Один пиксель»: стартовая сетка. */
  blocks?: number;
};
