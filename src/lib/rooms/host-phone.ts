// Телефон ведущего. Большой экран (с ключом ведущего) по кнопке показывает
// одноразовый код привязки — QR со ссылкой /host/КОД/phone#p=… и тот же код
// буквами. Телефон меняет его на свой ключ, код сгорает. Ключ телефона даёт
// ходы ведущего и эталон, но не ключ комнаты: новую привязку делает только
// экран.

// Без похожих символов (0/O, 1/I/L), чтобы код легко набрать руками.
export const PAIR_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const PAIR_LENGTH = 8;
export const PAIR_TTL_MS = 10 * 60 * 1000;

const PHONE_TOKEN = /^[A-Za-z0-9_-]{32,128}$/;

/** «abcd-efgh», «ABCD EFGH» → «ABCDEFGH»; мусор → null. */
export function normalizePairCode(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const cleaned = raw.toUpperCase().replace(/[\s-]/g, "");
  if (cleaned.length !== PAIR_LENGTH) return null;
  for (const char of cleaned) {
    if (!PAIR_ALPHABET.includes(char)) return null;
  }
  return cleaned;
}

/** Для экрана: «ABCD-EFGH». */
export function formatPairCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function phonePath(code: string): string {
  return `/host/${code}/phone`;
}

export function phoneLink(origin: string, code: string, pair: string): string {
  return `${origin.replace(/\/$/, "")}${phonePath(code)}#p=${pair}`;
}

export function pairFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  return normalizePairCode(params.get("p"));
}

export function isPhoneToken(value: unknown): value is string {
  return typeof value === "string" && PHONE_TOKEN.test(value);
}

/** Случайный код привязки из PAIR_ALPHABET (≈40 бит). */
export function randomPairCode(
  randomBytes: (size: number) => Uint8Array,
): string {
  const out: string[] = [];
  // Отбрасываем байты вне кратного диапазона — без перекоса алфавита.
  const limit = 256 - (256 % PAIR_ALPHABET.length);
  while (out.length < PAIR_LENGTH) {
    for (const byte of randomBytes(PAIR_LENGTH * 2)) {
      if (byte >= limit) continue;
      out.push(PAIR_ALPHABET[byte % PAIR_ALPHABET.length]);
      if (out.length === PAIR_LENGTH) break;
    }
  }
  return out.join("");
}
