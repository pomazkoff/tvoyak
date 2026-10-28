import { levenshtein } from "@/lib/answers/fuzzy";
import { normalizeAnswer } from "@/lib/answers/normalize";

function wordMatches(promptWord: string, needleWord: string): boolean {
  if (promptWord === needleWord) return true;
  const left = promptWord.replace(/[ьъ]/g, "");
  const right = needleWord.replace(/[ьъ]/g, "");
  if (left === right) return true;
  if (
    right.length >= 3 &&
    left.startsWith(right) &&
    left.length - right.length <= 2
  ) {
    return true;
  }
  if (
    left.length >= 3 &&
    right.startsWith(left) &&
    right.length - left.length <= 2
  ) {
    return true;
  }
  return right.length >= 5 && left.length >= 5 && levenshtein(left, right) <= 1;
}

/** Вопрос содержит эталон или допустимый вариант целиком, с падежным окончанием. */
export function promptContainsAnswer(prompt: string, needle: string): boolean {
  const normalized = normalizeAnswer(needle);
  if (normalized.length < 3) return false;
  const promptWords = normalizeAnswer(prompt).split(" ").filter(Boolean);
  const needleWords = normalized.split(" ").filter(Boolean);
  if (needleWords.length === 0) return false;

  for (
    let start = 0;
    start + needleWords.length <= promptWords.length;
    start += 1
  ) {
    const matches = needleWords.every((word, offset) =>
      wordMatches(promptWords[start + offset] ?? "", word),
    );
    if (matches) return true;
  }
  return false;
}
