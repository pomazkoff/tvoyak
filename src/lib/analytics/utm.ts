/**
 * UTM первого и последнего касания. Без персональных данных.
 * localStorage — основной носитель, cookie — запасной, если хранилище
 * недоступно. На сервер уходит уже очищенный объект.
 */

export const UTM_FIELDS = [
  "source",
  "medium",
  "campaign",
  "content",
  "term",
] as const;

export type UtmField = (typeof UTM_FIELDS)[number];
export type UtmTouch = Partial<Record<UtmField, string>>;
export type UtmRecord = { first?: UtmTouch; last?: UtmTouch };

const STORAGE_KEY = "tvoyak:utm:touch";
const COOKIE_KEY = "tvoyak_utm";
/** Как в политике: метки рекламного перехода живут не дольше 30 дней. */
export const UTM_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_LEN = 100;

type Stamp = { touch: UtmTouch; at: number };
type Stored = { first: Stamp | null; last: Stamp | null };

let fallback: Stored | null = null;

const QUERY_KEYS: Record<string, UtmField> = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_content: "content",
  utm_term: "term",
};

function looksPersonal(value: string): boolean {
  if (value.includes("@")) return true;
  return /\+?\d[\d\s()-]{9,}/.test(value);
}

/** Одна метка: короткая строка без почты и телефона. */
export function cleanUtmValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!trimmed || looksPersonal(trimmed)) return undefined;
  return trimmed.slice(0, MAX_LEN);
}

export function cleanTouch(input: unknown): UtmTouch | undefined {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return undefined;
  }
  const source = input as Record<string, unknown>;
  const touch: UtmTouch = {};
  for (const field of UTM_FIELDS) {
    const value = cleanUtmValue(source[field]);
    if (value) touch[field] = value;
  }
  return Object.keys(touch).length ? touch : undefined;
}

/** Метки из адреса. Лишние параметры и персональные значения выкидываются. */
export function parseUtmSearch(search: string): UtmTouch | undefined {
  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const raw: Record<string, string> = {};
  for (const [queryKey, field] of Object.entries(QUERY_KEYS)) {
    const value = params.get(queryKey);
    if (value) raw[field] = value;
  }
  return cleanTouch(raw);
}

/** То, что можно положить в jsonb. null — меток нет или они мусор. */
export function sanitizeUtm(input: unknown): UtmRecord | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const source = input as Record<string, unknown>;
  const first = cleanTouch(source.first);
  const last = cleanTouch(source.last);
  if (!first && !last) return null;
  return {
    ...(first ? { first } : {}),
    ...(last ? { last } : {}),
  };
}

function fresh(stamp: Stamp | null, now: number): Stamp | null {
  if (!stamp || typeof stamp.at !== "number" || !stamp.touch) return null;
  if (now - stamp.at > UTM_TTL_MS) return null;
  const touch = cleanTouch(stamp.touch);
  if (!touch) return null;
  return { touch, at: stamp.at };
}

function parseStored(raw: string | null, now: number): Stored {
  if (!raw) return { first: null, last: null };
  try {
    const parsed = JSON.parse(raw) as Partial<Stored>;
    return {
      first: fresh(parsed.first ?? null, now),
      last: fresh(parsed.last ?? null, now),
    };
  } catch {
    return { first: null, last: null };
  }
}

function readCookie(): string | null {
  if (typeof document === "undefined") return null;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  const prefix = `${COOKIE_KEY}=`;
  const found = parts.find((part) => part.startsWith(prefix));
  if (!found) return null;
  try {
    return decodeURIComponent(found.slice(prefix.length));
  } catch {
    return null;
  }
}

function writeCookie(raw: string): void {
  if (typeof document === "undefined") return;
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  const maxAge = Math.floor(UTM_TTL_MS / 1000);
  document.cookie = `${COOKIE_KEY}=${encodeURIComponent(raw)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
}

function readRaw(now: number): Stored {
  try {
    const fromStorage = parseStored(localStorage.getItem(STORAGE_KEY), now);
    if (fromStorage.first || fromStorage.last) return fromStorage;
  } catch {
    // хранилище закрыто
  }
  const fromCookie = parseStored(readCookie(), now);
  if (fromCookie.first || fromCookie.last) return fromCookie;
  if (!fallback) return { first: null, last: null };
  return {
    first: fresh(fallback.first, now),
    last: fresh(fallback.last, now),
  };
}

function writeRaw(stored: Stored): void {
  fallback = stored;
  const raw = JSON.stringify(stored);
  try {
    localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // останется cookie или память вкладки
  }
  try {
    writeCookie(raw);
  } catch {
    // кука не записалась — не страшно
  }
}

export function rememberUtmTouch(search: string, now = Date.now()): void {
  const incoming = parseUtmSearch(search);
  if (!incoming) return;
  const current = readRaw(now);
  writeRaw({
    first: current.first ?? { touch: incoming, at: now },
    last: { touch: incoming, at: now },
  });
}

export function readUtmTouch(now = Date.now()): UtmRecord {
  const stored = readRaw(now);
  return {
    ...(stored.first ? { first: stored.first.touch } : {}),
    ...(stored.last ? { last: stored.last.touch } : {}),
  };
}

/** Тело запроса создания комнаты и платежа. undefined — прикладывать нечего. */
export function utmForApi(now = Date.now()): UtmRecord | undefined {
  return sanitizeUtm(readUtmTouch(now)) ?? undefined;
}

/** Сброс запасной памяти. Нужен тестам: между кейсами модуль живёт. */
export function resetUtmFallback(): void {
  fallback = null;
}
