const PUNCTUATION = /[\u00AD!"#$%&'()*+,./:;<=>?@[\\\]^_`{|}~«»„“”‚‘’‒–—―−‐‑]/g;

export function normalizeAnswer(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\u0301/g, "")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(PUNCTUATION, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
