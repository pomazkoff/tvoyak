/**
 * Медиа вопроса (трек, «Звук наоборот», видео со звуком) на экране ведущего
 * стартует только после того, как голос ведущего дочитал вопрос. Раньше
 * трек и голос шли одновременно и перебивали друг друга.
 *
 * Зависший голос никогда не блокирует трек: через примерное время чтения
 * плюс запас трек включается сам.
 */

import { mediaPlaysSound } from "@/lib/game/music-pause";

/** Примерное время чтения вопроса вслух (как у таймера бота на кнопку). */
export function questionReadMs(prompt: string): number {
  return Math.min(30000, Math.max(6000, prompt.length * 70 + 2500));
}

/** Запас сверх оценки: загрузка голоса Марины, медленный синтез. */
export const MEDIA_HOLD_SLACK_MS = 4000;

/** Дольше этого экран ведущего трек не держит ни при каком вопросе. */
export const MEDIA_HOLD_MAX_MS = 30000 + MEDIA_HOLD_SLACK_MS;

/**
 * Телефон «не у экрана» ждёт отметку старта от экрана ведущего. Если её всё
 * нет (экран ведущего закрыт) — стартует сам, чуть позже предела удержания.
 */
export const REMOTE_FALLBACK_MS = MEDIA_HOLD_MAX_MS + 6000;

export type HoldCell = {
  id: string;
  kind: string;
  youtube_id?: string | null;
  vk_url?: string | null;
  rutube_url?: string | null;
  audio_url?: string | null;
  picture?: string | null;
  image_url?: string | null;
};

/** Держать ли медиа текущего вопроса, пока ведущий читает его вслух. */
export function shouldHoldMedia(input: {
  voiceOn: boolean;
  autoplay: boolean;
  phase: string | null | undefined;
  cell: HoldCell | null | undefined;
  prompt: string | null | undefined;
  /** Вопрос, для которого голос уже дочитал (или вышел срок). */
  releasedId: string | null;
}): boolean {
  const { voiceOn, autoplay, phase, cell, prompt, releasedId } = input;
  if (!voiceOn || !autoplay || !cell || !prompt) return false;
  // Читают вопрос только в фазе question; дальше (кнопка открыта) — играем.
  if (phase !== "question") return false;
  if (cell.picture && cell.image_url) return false;
  if (!mediaPlaysSound(cell as Parameters<typeof mediaPlaysSound>[0], phase))
    return false;
  return releasedId !== cell.id;
}

/**
 * Комната, где сервер НЕ ставит отметку старта медиа при открытии вопроса:
 * голос ведущего включён (по умолчанию — у бота). Там отметку ставит экран
 * ведущего, когда реально включил трек (см. миграцию media_hold_for_voice).
 */
export function roomVoiceOn(room: {
  host_voice?: boolean | null;
  host_mode: string;
}): boolean {
  return room.host_voice ?? room.host_mode === "bot";
}

/** Когда телефону «не у экрана» стартовать без отметки экрана ведущего. */
export function remoteFallbackStart(
  openedAt: string | null | undefined,
): number | null {
  if (!openedAt) return null;
  const opened = Date.parse(openedAt);
  return Number.isFinite(opened) ? opened + REMOTE_FALLBACK_MS : null;
}
