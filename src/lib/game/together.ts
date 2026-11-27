/**
 * Режим «Вместе»: один счёт на команду.
 *
 * Вопрос закрывается один раз. Очки получает команда, если верно ответил
 * хотя бы один. Номинал клетки умножается на серию: ×1, ×2, ×3 (дальше потолок).
 * Промах всей команды серию обнуляет и очки не снимает.
 * Личный счёт — вклад того, кто закрыл вопрос (те же очки, что прибавились команде).
 *
 * Та же арифметика в миграции together_resolve: множитель least(серия, 3).
 */

export type PlayMode = "versus" | "together";

export const TOGETHER_ANSWER_SECONDS = 30;
/** Потолок множителя серии. */
export const STREAK_CAP = 3;

export function parsePlayMode(value: unknown): PlayMode | null {
  if (value === undefined || value === "versus") return "versus";
  if (value === "together") return "together";
  return null;
}

export function isTogether(mode: string | null | undefined): boolean {
  return mode === "together";
}

export function minPlayers(mode: PlayMode): number {
  return mode === "together" ? 1 : 2;
}

/** Множитель уже идущей серии. Серия 1 → ×1, 2 → ×2, 3 и дальше → ×3. */
export function streakMultiplier(streak: number): number {
  if (streak < 1) return 1;
  return Math.min(Math.floor(streak), STREAK_CAP);
}

/** Множитель, если этот вопрос закроют верно. */
export function nextMultiplier(streak: number): number {
  return streakMultiplier(streak + 1);
}

export function liveMultiplierLabel(streak: number): string {
  const next = nextMultiplier(streak);
  if (streak <= 0) return "Верный ответ запустит серию";
  return `Серия ${streak} · этот вопрос ×${next}`;
}

export type TeamTally = {
  score: number;
  streak: number;
  bestStreak: number;
  correct: number;
  played: number;
  points: number;
  multiplier: number;
};

/** Закрытие вопроса: верно — очки и серия, мимо — серия с нуля, без штрафа. */
export function closeTogetherQuestion(input: {
  value: number;
  correct: boolean;
  streak: number;
  bestStreak: number;
  score: number;
  correctCount: number;
  played: number;
}): TeamTally {
  const played = input.played + 1;
  if (!input.correct) {
    return {
      points: 0,
      multiplier: 1,
      score: input.score,
      streak: 0,
      bestStreak: input.bestStreak,
      correct: input.correctCount,
      played,
    };
  }
  const streak = input.streak + 1;
  const multiplier = streakMultiplier(streak);
  const points = input.value * multiplier;
  return {
    points,
    multiplier,
    score: input.score + points,
    streak,
    bestStreak: Math.max(input.bestStreak, streak),
    correct: input.correctCount + 1,
    played,
  };
}

/** previous — рекорд компании до этой партии, null если его ещё не было. */
export function recordLine(current: number, previous: number | null): string {
  if (previous == null) return "Пока это лучший результат.";
  if (current > previous) return `Новый рекорд! Раньше было ${previous}.`;
  return `Рекорд компании — ${previous}.`;
}

export function hitNote(points: number, multiplier: number): string {
  if (multiplier > 1) return `Есть! +${points} (×${multiplier})`;
  return `Есть! +${points}`;
}

export function missNote(): string {
  return "Мимо. Если кто-то ещё знает — пусть пишет.";
}
