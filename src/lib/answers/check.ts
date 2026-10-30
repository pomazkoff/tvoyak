import { containsAsWords, levenshtein } from "@/lib/answers/fuzzy";
import { normalizeAnswer } from "@/lib/answers/normalize";
import { numberTokens } from "@/lib/answers/numbers";

export type AnswerMethod = "exact" | "fuzzy";

export type LocalAnswerCheck = {
  correct: boolean;
  similarity: number;
  method: AnswerMethod;
  ambiguous: boolean;
  normalizedGiven: string;
  normalizedExpected: string;
  scoreEffect: "add" | "subtract";
};

const RATIO_MATCH = 0.86;
const AMBIGUOUS_RATIO = 0.55;

export function checkAnswerLocally(
  given: string,
  expected: string,
): LocalAnswerCheck {
  const normalizedGiven = normalizeAnswer(given);
  const normalizedExpected = normalizeAnswer(expected);
  const shared = { normalizedGiven, normalizedExpected };

  if (!normalizedExpected || !normalizedGiven) {
    return {
      ...shared,
      correct: false,
      similarity: 0,
      method: "fuzzy",
      ambiguous: false,
      scoreEffect: "subtract",
    };
  }

  if (normalizedGiven === normalizedExpected) {
    return {
      ...shared,
      correct: true,
      similarity: 1,
      method: "exact",
      ambiguous: false,
      scoreEffect: "add",
    };
  }

  if (sameNumberAnswer(normalizedGiven, normalizedExpected)) {
    return {
      ...shared,
      correct: true,
      similarity: 0.95,
      method: "fuzzy",
      ambiguous: false,
      scoreEffect: "add",
    };
  }

  // Разные числа — разные ответы, даже если строки отличаются на букву:
  // «10 раз» ≠ «1 раз», «1914» ≠ «1941».
  const givenNumbers = numberTokens(normalizedGiven).sort().join(" ");
  const wantNumbers = numberTokens(normalizedExpected).sort().join(" ");
  if (givenNumbers && wantNumbers && givenNumbers !== wantNumbers) {
    return {
      ...shared,
      correct: false,
      similarity: 0,
      method: "fuzzy",
      ambiguous: false,
      scoreEffect: "subtract",
    };
  }

  const distance = levenshtein(normalizedGiven, normalizedExpected);
  const maxLength = Math.max(normalizedGiven.length, normalizedExpected.length);
  const similarity = 1 - distance / maxLength;
  const typo =
    (distance <= 1 && maxLength >= 5) || (distance <= 2 && maxLength >= 10);
  const contained =
    containsAsWords(normalizedGiven, normalizedExpected) ||
    containsAsWords(normalizedExpected, normalizedGiven);

  if (typo || contained || similarity >= RATIO_MATCH) {
    return {
      ...shared,
      correct: true,
      similarity: contained ? Math.max(similarity, 0.9) : similarity,
      method: "fuzzy",
      ambiguous: false,
      scoreEffect: "add",
    };
  }

  return {
    ...shared,
    correct: false,
    similarity,
    method: "fuzzy",
    ambiguous: similarity >= AMBIGUOUS_RATIO,
    scoreEffect: "subtract",
  };
}

/**
 * Ответ-число: «4 кошки» на эталон «Четыре», «1» на «Один раз». Эталон —
 * число и не больше одного слова (единица), у игрока то же число, та же
 * единица (если назвал) и не больше трёх лишних слов. «Белоснежка и 7 гномов» так не засчитать за «7».
 */
function sameNumberAnswer(given: string, expected: string): boolean {
  const wantNumbers = numberTokens(expected);
  if (wantNumbers.length !== 1) return false;
  const wantWords = expected.split(" ");
  if (wantWords.length > 2 || !/^\d+$/.test(wantWords[0] ?? "")) return false;
  const gotNumbers = numberTokens(given);
  if (gotNumbers.length !== 1 || gotNumbers[0] !== wantNumbers[0]) {
    return false;
  }
  const extra = given.split(" ").filter((word) => !/^\d+$/.test(word));
  if (extra.length > 3) return false;
  // Эталон с единицей («1 раз», «3 месяца»): у игрока либо только число,
  // либо та же единица в любом падеже — «3 года» за «3 месяца» не пойдёт.
  const unit = wantWords[1];
  if (!unit || extra.length === 0) return true;
  const stem = unit.slice(0, Math.min(3, unit.length));
  return extra.some((word) => word.startsWith(stem));
}

export function checkAgainstVariants(
  given: string,
  expected: string,
  variants: string[] = [],
): LocalAnswerCheck {
  const options = [expected, ...variants.filter((variant) => variant.trim())];
  let best = checkAnswerLocally(given, options[0] ?? "");
  for (const option of options.slice(1)) {
    const next = checkAnswerLocally(given, option);
    if (next.correct) {
      return { ...next, normalizedExpected: best.normalizedExpected };
    }
    if (next.similarity > best.similarity) {
      best = {
        ...best,
        similarity: next.similarity,
        ambiguous: best.ambiguous || next.ambiguous,
      };
    } else if (next.ambiguous) {
      best = { ...best, ambiguous: true };
    }
  }
  return best;
}
