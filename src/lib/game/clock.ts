// Клиентская часть серверных сроков. Сервер — источник правды: клиент только
// зовёт advance_clock, когда его локальный таймер дошёл до нуля, и повторяет
// вызов с растущей паузой, пока версия партии не сменится.

export type ClockGame = {
  phase: string;
  version: number;
  deadline: string | null;
  updated_at?: string | null;
};

/** Столько бот-ведущий читает вопрос, прежде чем часы откроют кнопку сами. */
export const BOT_READ_LIMIT_MS = 45000;

/** Сколько ждать первый вызов после края срока: запас на расхождение часов. */
export const CLOCK_GRACE_MS = 350;
export const CLOCK_MAX_ATTEMPTS = 12;

/** Момент, после которого стоит звать advance_clock, или null, если срока нет. */
export function clockDueAt(
  game: ClockGame,
  hostMode?: "human" | "bot",
): number | null {
  if (game.phase === "question" && hostMode === "bot" && game.updated_at) {
    const read = new Date(game.updated_at).getTime();
    return Number.isFinite(read)
      ? read + BOT_READ_LIMIT_MS + CLOCK_GRACE_MS
      : null;
  }
  if (!game.deadline) return null;
  const due = new Date(game.deadline).getTime();
  return Number.isFinite(due) ? due + CLOCK_GRACE_MS : null;
}

/** Пауза перед повтором: 0.8 с, 1.6 с, 3.2 с, дальше раз в 5 с. */
export function clockRetryDelay(attempt: number): number {
  return Math.min(5000, 800 * 2 ** Math.max(0, attempt));
}

export function clockKey(game: ClockGame): string {
  return `${game.version}:${game.phase}:${game.deadline ?? ""}`;
}
