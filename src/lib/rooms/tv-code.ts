// Код, которым телевизор без входа открывает табло комнаты.
// Телефон ведущего показывает шесть цифр и адрес /tv. Телевизор меняет код
// на свой ключ экрана (его принимает та же проверка, что и ключ комнаты).
// Код короткий, поэтому попытки ввода ограничены на сервере.

export const TV_CODE_LENGTH = 6;
export const TV_CODE_TTL_MS = 15 * 60 * 1000;

const TV_CODE = /^\d{6}$/;

/** «123 456», «123-456» → «123456». Иначе null. */
export function normalizeTvCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s-]/g, "");
  return TV_CODE.test(cleaned) ? cleaned : null;
}

/** Для экрана: «123 456». */
export function formatTvCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

/** Что набрать на телевизоре: «tvoyak.ru/tv» или хост текущего превью. */
export function tvEntryLabel(origin: string): string {
  const trimmed = origin.trim().replace(/\/$/, "");
  if (!trimmed) return "tvoyak.ru/tv";
  try {
    const host = new URL(trimmed).host.replace(/^www\./, "");
    return host ? `${host}/tv` : "tvoyak.ru/tv";
  } catch {
    return "tvoyak.ru/tv";
  }
}

function ruMinutes(mins: number): string {
  const n = mins % 100;
  const n1 = mins % 10;
  if (n > 10 && n < 20) return `${mins} минут`;
  if (n1 === 1) return `${mins} минуту`;
  if (n1 >= 2 && n1 <= 4) return `${mins} минуты`;
  return `${mins} минут`;
}

/** «ещё 15 минут». Просрочено или мусор — null. */
export function formatCodeTtl(
  expiresAt: string,
  now = Date.now(),
): string | null {
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left) || left <= 0) return null;
  const mins = Math.max(1, Math.ceil(left / 60_000));
  return `ещё ${ruMinutes(mins)}`;
}

/** Шесть цифр без перекоса: байты вне кратного диапазона отбрасываются. */
export function randomTvCode(
  randomBytes: (size: number) => Uint8Array,
): string {
  const span = 1_000_000;
  const limit = Math.floor(0x1_0000_0000 / span) * span;
  for (;;) {
    const buf = randomBytes(4);
    if (buf.length < 4) continue;
    const value =
      ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0;
    if (value >= limit) continue;
    return String(value % span).padStart(TV_CODE_LENGTH, "0");
  }
}

const displayKey = (roomCode: string) => `tvoyak.tvDisplay.${roomCode}`;

/** Этот браузер открыл табло по коду /tv — код для телевизора ему не показываем. */
export function markTvDisplay(roomCode: string): void {
  try {
    localStorage.setItem(displayKey(roomCode), "1");
  } catch {
    // Без хранилища карточка на телефоне всё равно останется.
  }
}

export function isTvDisplay(roomCode: string): boolean {
  try {
    return localStorage.getItem(displayKey(roomCode)) === "1";
  } catch {
    return false;
  }
}
