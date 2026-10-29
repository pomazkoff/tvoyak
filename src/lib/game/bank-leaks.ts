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

const CYR_TO_LAT: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "h",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};

/**
 * Грубый «звуковой скелет» слова для сравнения латиницы с кириллицей:
 * Шазам ~ Shazam, Тикток ~ TikTok, Джастин ~ Justin. Только согласные.
 */
export function soundSkeleton(word: string): string {
  const latin = [...word.toLowerCase().replace(/ё/g, "е")]
    .map((char) => CYR_TO_LAT[char] ?? char)
    .join("");
  return latin
    .replace(/[^a-z0-9]/g, "")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/[cq]/g, "k")
    .replace(/w/g, "v")
    .replace(/x/g, "ks")
    .replace(/j/g, "dzh")
    .replace(/(?<=[^dzkscth])h/g, "")
    .replace(/[aeiouy]/g, "")
    .replace(/(.)\1+/g, "$1");
}

const isLatin = (word: string) => /^[a-z0-9]+$/.test(word);
const isCyrillic = (word: string) => /^[а-я0-9]+$/.test(word);

function crossScriptMatch(promptWord: string, needleWord: string): boolean {
  if (needleWord.length < 4 || promptWord.length < 4) return false;
  const mixed =
    (isLatin(promptWord) && isCyrillic(needleWord)) ||
    (isCyrillic(promptWord) && isLatin(needleWord));
  if (!mixed) return false;
  const left = soundSkeleton(promptWord);
  const right = soundSkeleton(needleWord);
  if (left.length < 3 || right.length < 3) return false;
  if (left === right) return true;
  // падежное окончание: «Шазамом» ~ Shazam
  return (
    (left.startsWith(right) && left.length - right.length <= 1) ||
    (right.startsWith(left) && right.length - left.length <= 1)
  );
}

/** Слова, которые сами по себе ответа не выдают. */
const GENERIC = new Set(
  "the of and a an in on to for with feat группа игра сериал фильм мультфильм клип песня трек город башня статуя театр собор храм премия сервис канал шоу кот".split(
    " ",
  ),
);

export type AnswerLeak = {
  needle: string;
  /** full — ответ целиком (в т. ч. транслитом); part — значимое слово ответа. */
  level: "full" | "part";
  via: "same" | "translit";
};

/**
 * Детерминированная проверка утечки ответа в текст, который видят игроки
 * (вопрос, категория, имя файла картинки): регистр, ё/е, пунктуация,
 * латиница/кириллица, части имени исполнителя или трека, варианты ответа.
 */
export function findAnswerLeaks(
  text: string,
  answer: string,
  variants: string[] = [],
): AnswerLeak[] {
  const textWords = normalizeAnswer(text).split(" ").filter(Boolean);
  const leaks: AnswerLeak[] = [];
  for (const needle of [answer, ...variants]) {
    const words = normalizeAnswer(needle).split(" ").filter(Boolean);
    if (!words.length) continue;
    const joined = words.join(" ");
    if (!joined) continue;
    // целиком
    let full: AnswerLeak["via"] | null = null;
    for (let start = 0; start + words.length <= textWords.length; start += 1) {
      const span = textWords.slice(start, start + words.length);
      if (
        span.every(
          (word, i) => word === words[i] || wordMatches(word, words[i]),
        )
      ) {
        full = "same";
        break;
      }
      if (
        span.every(
          (word, i) =>
            wordMatches(word, words[i]) || crossScriptMatch(word, words[i]),
        )
      ) {
        full = "translit";
        break;
      }
    }
    // «LoL», «КС» и т. п. — короткие варианты ловим только точным словом
    if (!full && joined.length < 3) continue;
    if (
      !full &&
      words.length === 1 &&
      textWords.join("").includes(joined) &&
      joined.length >= 5
    )
      full = "same"; // слитно: «thebrianmaps» в «TheBrianMaps»
    if (full) {
      leaks.push({ needle, level: "full", via: full });
      continue;
    }
    if (words.length < 2) continue;
    for (const word of words) {
      if (word.length < 4 || GENERIC.has(word)) continue;
      const hit = textWords.find(
        (t) => wordMatches(t, word) || crossScriptMatch(t, word),
      );
      if (hit) {
        leaks.push({
          needle: word,
          level: "part",
          via: wordMatches(hit, word) ? "same" : "translit",
        });
      }
    }
  }
  const seen = new Set<string>();
  return leaks.filter((leak) => {
    const key = `${leak.level}:${normalizeAnswer(leak.needle)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Утечка, из-за которой вопрос нельзя пускать в игру. */
export function hasBlockingLeak(
  text: string,
  answer: string,
  variants: string[] = [],
): boolean {
  return findAnswerLeaks(text, answer, variants).some(
    (leak) => leak.level === "full",
  );
}
