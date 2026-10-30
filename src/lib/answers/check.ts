import { levenshtein } from "@/lib/answers/fuzzy";
import { answerTokens, normalizeAnswer } from "@/lib/answers/normalize";
import { numberTokens } from "@/lib/answers/numbers";
import { phoneticKey } from "@/lib/answers/translit";

export type AnswerMethod = "exact" | "fuzzy";

export type LocalAnswerCheck = {
  correct: boolean;
  similarity: number;
  method: AnswerMethod;
  /** Похоже, но не уверены — раньше только такие ответы шли к LLM. */
  ambiguous: boolean;
  /**
   * Точно неверно, LLM спрашивать незачем: пустой ответ, «не знаю»,
   * другое число («1914» на «1941»).
   */
  definite: boolean;
  normalizedGiven: string;
  normalizedExpected: string;
  scoreEffect: "add" | "subtract";
};

const AMBIGUOUS_RATIO = 0.55;

/** Сколько опечаток прощаем строке такой длины (в буквах). */
export function typoBudget(length: number): number {
  if (length < 5) return 0;
  if (length < 10) return 1;
  if (length < 15) return 2;
  return Math.floor(length * 0.14);
}

// «Не знаю» и пустые отписки — LLM не нужен.
const NO_ANSWER =
  /^(не знаю|незнаю|я не знаю|хз|х з|без понятия|пас|пропуск|нет|не|idk|pass|\d?)$/;

// Родовые слова: если игрок назвал только их, это не ответ на «Парусный
// спорт», «Статуя Свободы» или «Петропавловская крепость».
const GENERIC = new Set([
  "спорт",
  "система",
  "статуя",
  "остров",
  "город",
  "река",
  "озеро",
  "гора",
  "море",
  "улица",
  "площадь",
  "собор",
  "храм",
  "мечеть",
  "музей",
  "дворец",
  "крепость",
  "башня",
  "мост",
  "сериал",
  "фильм",
  "мультфильм",
  "игра",
  "группа",
  "турнир",
  "кубок",
  "лига",
  "контроль",
  "сообщения",
  "кухня",
  "суп",
  "салат",
  "соус",
  "премия",
  "война",
  "дела",
  "компания",
  "корпорация",
  "сеть",
  "день",
  "год",
  "век",
  "король",
  "королева",
  "принц",
  "президент",
  "the",
  "of",
  "club",
  "city",
  "game",
  "show",
  "group",
  "league",
  "cup",
  "entertainment",
  "corporation",
  "inc",
  "ltd",
  "band",
]);

type Shared = { normalizedGiven: string; normalizedExpected: string };

function verdict(
  shared: Shared,
  correct: boolean,
  similarity: number,
  method: AnswerMethod,
  extra: { ambiguous?: boolean; definite?: boolean } = {},
): LocalAnswerCheck {
  return {
    ...shared,
    correct,
    similarity,
    method,
    ambiguous: !correct && (extra.ambiguous ?? false),
    definite: !correct && (extra.definite ?? false),
    scoreEffect: correct ? "add" : "subtract",
  };
}

function ratio(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - levenshtein(a, b) / maxLength;
}

/**
 * Две строки совпадают с точностью до опечаток (бюджет по длине). В коротких
 * словах первая буква должна совпасть: «Баста» ≠ «Каста».
 */
function closeEnough(a: string, b: string): boolean {
  if (a === b) return true;
  const length = Math.max(a.length, b.length);
  if (length < 8 && a[0] !== b[0]) return false;
  return levenshtein(a, b) <= typoBudget(length);
}

/**
 * Звуковые ключи совпадают с точностью до одной-двух букв. Короткие ключи
 * (до 6 букв) — только целиком: «Sony» ≠ «Соник».
 */
function keysClose(a: string, b: string): boolean {
  if (a === b) return true;
  const length = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) < 6) return false;
  return levenshtein(a, b) <= typoBudget(length);
}

/**
 * Слово совпадает: само по себе с опечаткой или по звуковому ключу.
 * `strict` — без опечаток, только то же слово или его транслит.
 */
function sameWord(a: string, b: string, strict = false): boolean {
  if (a === b) return true;
  if (/^\d+$/.test(a) || /^\d+$/.test(b)) return false;
  const keyA = phoneticKey(a);
  const keyB = phoneticKey(b);
  if (strict) return keyA === keyB;
  return closeEnough(a, b) || keysClose(keyA, keyB);
}

/**
 * Каждое слово из `needles` находит себе пару в `haystack` (в любом
 * порядке, каждое слово — один раз).
 */
function matchWords(
  needles: string[],
  haystack: string[],
  strict = false,
): boolean {
  const free = [...haystack];
  for (const needle of needles) {
    const index = free.findIndex((word) => sameWord(needle, word, strict));
    if (index === -1) return false;
    free.splice(index, 1);
  }
  return true;
}

export function checkAnswerLocally(
  given: string,
  expected: string,
): LocalAnswerCheck {
  const normalizedGiven = normalizeAnswer(given);
  const normalizedExpected = normalizeAnswer(expected);
  const shared = { normalizedGiven, normalizedExpected };

  if (!normalizedExpected || !normalizedGiven) {
    return verdict(shared, false, 0, "fuzzy", { definite: true });
  }

  if (normalizedGiven === normalizedExpected) {
    return verdict(shared, true, 1, "exact");
  }

  if (sameNumberAnswer(normalizedGiven, normalizedExpected)) {
    return verdict(shared, true, 0.95, "fuzzy");
  }

  if (NO_ANSWER.test(normalizedGiven)) {
    return verdict(shared, false, 0, "fuzzy", { definite: true });
  }

  // Разные числа — разные ответы, даже если строки отличаются на букву:
  // «10 раз» ≠ «1 раз», «1914» ≠ «1941».
  const givenNumbers = numberTokens(normalizedGiven).sort().join(" ");
  const wantNumbers = numberTokens(normalizedExpected).sort().join(" ");
  if (givenNumbers && wantNumbers && givenNumbers !== wantNumbers) {
    return verdict(shared, false, 0, "fuzzy", { definite: true });
  }

  const givenWords = answerTokens(normalizedGiven);
  const wantWords = answerTokens(normalizedExpected);
  const givenKey = givenWords.map(phoneticKey).join("");
  const wantKey = wantWords.map(phoneticKey).join("");
  const similarity = Math.max(
    ratio(normalizedGiven, normalizedExpected),
    ratio(givenKey, wantKey),
  );

  // Целиком: опечатки, слитно/раздельно («New Jeans» = «NewJeans»),
  // латиница/кириллица («Инстаграм» = «Instagram»).
  const joinedGiven = givenWords.join("");
  const joinedWant = wantWords.join("");
  // Для нескольких слов поровну — только пословно (ниже): иначе «Пол
  // Маккартни» на «Джон Маккартни» прошёл бы как две опечатки.
  const wordwise =
    givenWords.length === wantWords.length && givenWords.length > 1;
  if (
    !wordwise &&
    (closeEnough(joinedGiven, joinedWant) || keysClose(givenKey, wantKey))
  ) {
    return verdict(shared, true, Math.max(similarity, 0.9), "fuzzy");
  }

  // Те же слова в другом порядке: «Ван Бюрен Армин».
  if (wordwise && matchWords(givenWords, wantWords)) {
    return verdict(shared, true, Math.max(similarity, 0.9), "fuzzy");
  }

  // Перечисление на выбор («скелетон, бобслей», «Тикток или Likee») —
  // дополнения и части имени не засчитываем, решает LLM.
  const hedged = /[,;/]|\s(или|or)\s/i.test(given);

  // Игрок назвал эталон и добавил немного своего: «Александр Пушкин» на
  // «Пушкин», «группа Кино» на «Кино». Больше трёх лишних слов — уже не то.
  const extra = givenWords.length - wantWords.length;
  if (
    !hedged &&
    extra > 0 &&
    extra <= 3 &&
    joinedWant.length >= 4 &&
    !givenWords.includes("не") &&
    matchWords(wantWords, givenWords, true)
  ) {
    return verdict(shared, true, Math.max(similarity, 0.9), "fuzzy");
  }

  // Часть составного эталона: фамилия без имени («Тирсен» на «Ян Тирсен»,
  // «Маяковский» на «Владимир Маяковский»). Только последнее слово эталона,
  // не родовое («спорт» за «Парусный спорт» не пойдёт) и не короче 4 букв.
  const last = wantWords[wantWords.length - 1] ?? "";
  if (
    !hedged &&
    wantWords.length > 1 &&
    looksLikeName(expected) &&
    givenWords.length < wantWords.length &&
    last.length >= 4 &&
    !GENERIC.has(last) &&
    !/^\d+$/.test(last) &&
    givenWords.some((word) => sameWord(word, last, last.length < 7)) &&
    matchWords(givenWords, wantWords, last.length < 7)
  ) {
    return verdict(shared, true, Math.max(similarity, 0.85), "fuzzy");
  }

  return verdict(shared, false, similarity, "fuzzy", {
    ambiguous: similarity >= AMBIGUOUS_RATIO,
  });
}

// Прилагательное первым словом — «Северная Корея», «Нижний Новгород»:
// последнее слово само по себе — другой ответ.
const ADJECTIVE = /(ая|яя|ий|ый|ой|ое|ее|ые|ие|ого|его)$/;

/**
 * Эталон похож на имя собственное: 2–3 слова, каждое с большой буквы,
 * первое — не прилагательное. «Ян Тирсен», «Martin Garrix» — да;
 * «Игра престолов», «Северная Корея» — нет.
 */
function looksLikeName(expected: string): boolean {
  const words = expected
    .normalize("NFKC")
    .split(/[\s\-‐‑–—]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (words.length < 2 || words.length > 3) return false;
  // «Маша и Медведь», «Tom & Jerry» — два героя, а не имя и фамилия.
  if (/(^|\s)(и|and|&)(\s|$)/i.test(expected)) return false;
  const first = (words[0] ?? "").toLocaleLowerCase("ru-RU");
  if (ADJECTIVE.test(first) && /[а-яё]/.test(first)) return false;
  return words.every(
    (word) => /^[\p{Lu}\p{N}]/u.test(word) || word.length <= 3,
  );
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
  // Игрок назвал число, а эталон — с числом: число должно совпасть с
  // эталоном или вариантом с числом. Иначе «44 миллиарда» прошли бы по
  // варианту «миллиард долларов», а «2 копейки» — по варианту «копейка».
  const givenNumbers = numberKey(given);
  const numbered = options.map(numberKey).filter(Boolean);
  if (givenNumbers && numbered.length && !numbered.includes(givenNumbers)) {
    const local = checkAnswerLocally(given, expected);
    return {
      ...local,
      correct: false,
      definite: true,
      ambiguous: false,
      scoreEffect: "subtract",
    };
  }
  let best = checkAnswerLocally(given, options[0] ?? "");
  for (const option of options.slice(1)) {
    const next = checkAnswerLocally(given, option);
    if (next.correct) {
      return { ...next, normalizedExpected: best.normalizedExpected };
    }
    best = {
      ...best,
      similarity: Math.max(best.similarity, next.similarity),
      ambiguous: best.ambiguous || next.ambiguous,
      // Число не совпало с эталоном, но вариант без чисел — пусть решает LLM.
      definite: best.definite && next.definite,
    };
  }
  return best;
}

function numberKey(text: string): string {
  return numberTokens(normalizeAnswer(text)).sort().join(" ");
}

/** Стоит ли спрашивать LLM: локально не засчитано, но и не «точно мимо». */
export function needsLlm(local: LocalAnswerCheck): boolean {
  return !local.correct && !local.definite;
}
