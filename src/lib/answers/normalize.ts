import { numberWordsToDigits } from "@/lib/answers/numbers";
import { fixLookalikes } from "@/lib/answers/translit";

const PUNCTUATION = /[\u00AD!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~«»„“”‚‘’‒–—―−‐‑]/g;

/**
 * Регистр, «ё», пунктуация, пробелы, буквы-двойники латиницы и кириллицы
 * в одном слове; числительные словами → цифры.
 */
export function normalizeAnswer(input: string): string {
  return numberWordsToDigits(basicNormalize(input));
}

function basicNormalize(input: string): string {
  return fixLookalikes(input.normalize("NFKC").replace(/\u0301/g, ""))
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, (mark, offset, whole: string) =>
      // «й» и «ё» в NFKD — буква + знак; их не трогаем, остальные
      // диакритики латиницы снимаем: Dvořák = Dvorak, Coupé = Coupe.
      /[иеИЕ]/.test(whole[offset - 1] ?? "") ? mark : "",
    )
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(PUNCTUATION, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Служебные слова, которые не меняют ответ: артикли, союз между двумя
// именами («Хамали и Наваи» = «HammAli & Navai»).
const FILLER = new Set([
  "the",
  "a",
  "an",
  "и",
  "and",
  "n",
  "der",
  "die",
  "das",
  "la",
  "le",
  "les",
  "el",
]);

/** Значимые слова нормализованного ответа (без артиклей и «и»/«and»). */
export function answerTokens(normalized: string): string[] {
  const words = normalized.split(" ").filter(Boolean);
  const content = words.filter((word) => !FILLER.has(word));
  return content.length ? content : words;
}
