/**
 * Одна добрая номинация на итог. Нет данных или отрыв крошечный — ничего,
 * без «худших» и без выдуманных титулов.
 */

export type TimedAnswer = {
  playerId: string;
  correct: boolean;
  elapsedMs: number | null;
};

export type AnswerRow = {
  playerId: string;
  questionId: string;
  verdict: string;
  createdAt: string;
};

export type BuzzRow = {
  playerId: string;
  questionId: string;
  first: boolean;
  at: string;
};

const MIN_ELAPSED = 400;
const MAX_ELAPSED = 90_000;
const MIN_SAMPLES = 2;
const MIN_GAP_MS = 500;
const MIN_CORRECT = 3;
const MIN_LEAD = 2;

export function elapsedMs(
  open: string | null | undefined,
  stamp: string | null | undefined,
): number | null {
  if (!open || !stamp) return null;
  const ms = Date.parse(stamp) - Date.parse(open);
  if (!Number.isFinite(ms)) return null;
  return ms;
}

/** Время до верного ответа: кнопка, если игрок был первым, иначе момент ответа. */
export function timedFromRows(
  answers: readonly AnswerRow[],
  openedAt: ReadonlyMap<string, string | null>,
  buzzes: readonly BuzzRow[],
): TimedAnswer[] {
  const firstBuzz = new Map<string, string>();
  for (const buzz of buzzes) {
    if (!buzz.first || !buzz.at) continue;
    firstBuzz.set(`${buzz.playerId}:${buzz.questionId}`, buzz.at);
  }
  return answers.map((answer) => {
    const open = openedAt.get(answer.questionId) ?? null;
    const buzzAt =
      firstBuzz.get(`${answer.playerId}:${answer.questionId}`) ?? null;
    return {
      playerId: answer.playerId,
      correct: answer.verdict === "correct",
      elapsedMs: elapsedMs(open, buzzAt ?? answer.createdAt),
    };
  });
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

export function pickNomination(
  seats: readonly { id: string; nickname: string }[],
  answers: readonly TimedAnswer[],
): { title: string; nickname: string } | null {
  const names = new Map(seats.map((seat) => [seat.id, seat.nickname]));
  const fast = fastest(answers, names);
  if (fast) return { title: "Самый быстрый", nickname: fast };
  const precise = mostPrecise(answers, names);
  if (precise) return { title: "Самый точный", nickname: precise };
  return null;
}

function fastest(
  answers: readonly TimedAnswer[],
  names: ReadonlyMap<string, string>,
): string | null {
  const buckets = new Map<string, number[]>();
  for (const answer of answers) {
    if (!answer.correct || answer.elapsedMs == null) continue;
    if (answer.elapsedMs < MIN_ELAPSED || answer.elapsedMs > MAX_ELAPSED)
      continue;
    if (!names.has(answer.playerId)) continue;
    const list = buckets.get(answer.playerId) ?? [];
    list.push(answer.elapsedMs);
    buckets.set(answer.playerId, list);
  }
  const ranked = [...buckets.entries()]
    .filter(([, list]) => list.length >= MIN_SAMPLES)
    .map(([id, list]) => ({ id, median: median(list) }))
    .sort((left, right) => left.median - right.median);
  if (ranked.length < 2) return null;
  const best = ranked[0];
  const next = ranked[1];
  if (!best || !next || next.median - best.median < MIN_GAP_MS) return null;
  return names.get(best.id) ?? null;
}

function mostPrecise(
  answers: readonly TimedAnswer[],
  names: ReadonlyMap<string, string>,
): string | null {
  const counts = new Map<string, number>();
  for (const answer of answers) {
    if (!answer.correct || !names.has(answer.playerId)) continue;
    counts.set(answer.playerId, (counts.get(answer.playerId) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    (left, right) => right[1] - left[1],
  );
  if (ranked.length < 2) return null;
  const leader = ranked[0];
  const second = ranked[1];
  if (!leader || !second) return null;
  if (leader[1] < MIN_CORRECT || leader[1] - second[1] < MIN_LEAD) return null;
  return names.get(leader[0]) ?? null;
}
