import { containsAsWords, levenshtein } from "@/lib/answers/fuzzy";
import { normalizeAnswer } from "@/lib/answers/normalize";

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
