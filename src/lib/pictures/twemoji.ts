/**
 * Эмодзи рисуем картинками Twemoji (CC-BY 4.0, © Twitter / jdecked):
 * одинаково на любом телевизоре и ноутбуке, без системных шрифтов.
 */
export const TWEMOJI_BASE =
  "https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/";

export const TWEMOJI_CREDIT =
  "Эмодзи: Twemoji © Twitter, Inc. и участники jdecked/twemoji, CC-BY 4.0";

/** Код файла Twemoji: кодовые точки в hex через «-», без FE0F (кроме ZWJ-цепочек). */
export function twemojiCode(emoji: string): string {
  const points = Array.from(emoji).map((char) => char.codePointAt(0) as number);
  const hasZwj = points.includes(0x200d);
  return points
    .filter((point) => hasZwj || point !== 0xfe0f)
    .map((point) => point.toString(16))
    .join("-");
}

export function twemojiUrl(emoji: string): string {
  return `${TWEMOJI_BASE}${twemojiCode(emoji)}.svg`;
}

/** Похоже ли на один эмодзи (а не буквы/цифры текстом). */
export function looksLikeEmoji(value: string): boolean {
  if (!value || value.length > 16) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(value);
}

const cache = new Map<string, Promise<string | null>>();

/** Содержимое SVG эмодзи (без внешнего <svg>), viewBox 0 0 36 36. */
export function loadTwemoji(emoji: string): Promise<string | null> {
  const code = twemojiCode(emoji);
  let pending = cache.get(code);
  if (!pending) {
    pending = fetch(`${TWEMOJI_BASE}${code}.svg`, {
      signal: AbortSignal.timeout(8_000),
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const text = await response.text();
        const open = text.indexOf(">", text.indexOf("<svg"));
        const close = text.lastIndexOf("</svg>");
        if (open < 0 || close < 0) return null;
        return text.slice(open + 1, close);
      })
      .catch(() => null);
    cache.set(code, pending);
    // Неудачу не кэшируем навсегда — CDN мог моргнуть.
    void pending.then((value) => {
      if (value === null) cache.delete(code);
    });
  }
  return pending;
}
