/**
 * Латиница ↔ кириллица для сравнения ответов.
 *
 * Игроки пишут «Инстаграм» вместо «Instagram», «Хамали и Наваи» вместо
 * «HammAli & Navai», «Блютуз» вместо «Bluetooth». Чтобы такие ответы
 * совпадали без LLM, оба текста сводятся к грубому «звуковому ключу»
 * на латинице: кириллица транслитерируется, английские буквосочетания
 * упрощаются (ph → f, th → t, c → k/s, ee → i …), двойные буквы
 * схлопываются. Ключ нужен только для сравнения, игроку его не показываем.
 */

const LOOKALIKE_LATIN_TO_CYR: Record<string, string> = {
  a: "а",
  A: "А",
  c: "с",
  C: "С",
  e: "е",
  E: "Е",
  o: "о",
  O: "О",
  p: "р",
  P: "Р",
  x: "х",
  X: "Х",
  y: "у",
  Y: "У",
  k: "к",
  K: "К",
  M: "М",
  T: "Т",
  H: "Н",
  B: "В",
};

const LOOKALIKE_CYR_TO_LATIN: Record<string, string> = Object.fromEntries(
  Object.entries(LOOKALIKE_LATIN_TO_CYR).map(([latin, cyr]) => [cyr, latin]),
);

const CYR = /[\u0400-\u04FF]/;
const LATIN = /[A-Za-z]/;

/**
 * Слово, набранное вперемешку латиницей и кириллицей («Cтатуя» с латинской
 * C, «Пepу»), приводится к одному алфавиту — тому, которого в слове больше,
 * если буквы другого алфавита только похожие по виду.
 */
export function fixLookalikes(input: string): string {
  return input.replace(/[\p{L}]+/gu, (word) => {
    if (!CYR.test(word) || !LATIN.test(word)) return word;
    const letters = [...word];
    const cyr = letters.filter((ch) => CYR.test(ch)).length;
    const latin = letters.filter((ch) => LATIN.test(ch)).length;
    if (cyr >= latin) {
      const allLookalike = letters.every(
        (ch) => !LATIN.test(ch) || ch in LOOKALIKE_LATIN_TO_CYR,
      );
      return allLookalike
        ? letters.map((ch) => LOOKALIKE_LATIN_TO_CYR[ch] ?? ch).join("")
        : word;
    }
    const allLookalike = letters.every(
      (ch) => !CYR.test(ch) || ch in LOOKALIKE_CYR_TO_LATIN,
    );
    return allLookalike
      ? letters.map((ch) => LOOKALIKE_CYR_TO_LATIN[ch] ?? ch).join("")
      : word;
  });
}

// Заглавные буквы — служебные звуки, чтобы их не задели правила для
// латиницы: C = «ч», S = «ш», J = «ж/дж», Z = «ц».
const CYR_TO_KEY: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "J",
  з: "z",
  и: "i",
  й: "i",
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
  ц: "Z",
  ч: "C",
  ш: "S",
  щ: "S",
  ъ: "",
  ы: "i",
  ь: "",
  э: "e",
  ю: "u",
  я: "a",
  і: "i",
  ї: "i",
  є: "e",
};

function cyrillicToKey(word: string): string {
  const letters = [...word];
  let out = "";
  for (let index = 0; index < letters.length; index += 1) {
    const ch = letters[index] ?? "";
    const next = letters[index + 1];
    // «я», «ю» в начале слова и после гласной звучат с «й»: Юлия, Яндекс.
    const prev = letters[index - 1];
    if ((ch === "я" || ch === "ю") && (!prev || /[аеиоуыэюяьъ]/.test(prev))) {
      out += "i";
    }
    if (ch === "д" && next === "ж") continue; // «дж» = J
    if (ch === "т" && next === "с") {
      out += "Z"; // «тс» = «ц» = ts: Вотсап = WhatsApp
      index += 1;
      continue;
    }
    out += CYR_TO_KEY[ch] ?? ch;
  }
  return out;
}

function latinToKey(word: string): string {
  return word
    .replace(/^wha/, "vo") // What's App = Вотсап
    .replace(/ew|ow/g, "u") // New = Нью, Show = Шоу
    .replace(/qu/g, "kv") // Queen = Квин
    .replace(/(?<=[^aeiou])a(?=[^aeiou]e(?:$|[bcdfgkmpstvz]))/g, "ei") // Face = Фейс, Game = Гейм
    .replace(/sch|sh/g, "S")
    .replace(/tch|ch/g, "C")
    .replace(/dzh|zh|dj|dg/g, "J")
    .replace(/j/g, "J")
    .replace(/tz|ts/g, "Z")
    .replace(/ph/g, "f")
    .replace(/th/g, "t")
    .replace(/kh/g, "h")
    .replace(/gh/g, "g")
    .replace(/ck/g, "k")
    .replace(/q/g, "k")
    .replace(/x/g, "ks")
    .replace(/w/g, "v")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/c/g, "k")
    .replace(/g(?=[eiy])/g, "J")
    .replace(/y/g, "i");
}

function simplifyVowels(key: string, latin: boolean): string {
  let out = key;
  for (let pass = 0; pass < 2; pass += 1) {
    out = out
      .replace(/ee|ea|ie|ei|ey|ay|ai/g, "i")
      .replace(/oo|ou|ue|iu|yu/g, "u")
      .replace(/ia(?=[^aeiou]|$)/g, "a");
  }
  if (latin && out.length >= 4) {
    out = out
      .replace(/([^aeiou])e$/, "$1") // немая e на конце: Line = Лайн
      .replace(/([^aeiou])es$/, "$1s"); // Beatles = Битлз
  }
  return out
    .replace(/z$/, "s") // Битлз = Beatles
    .replace(/(.)\1+/g, "$1"); // двойные буквы: Garrix = Гаррикс = Гарикс
}

/** Звуковой ключ одного слова (уже в нижнем регистре, без пунктуации). */
export function phoneticKey(word: string): string {
  if (!word) return "";
  if (/^\d+$/.test(word)) return word;
  const cyrillic = CYR.test(word);
  const latin = cyrillic ? cyrillicToKey(word) : latinToKey(word);
  return simplifyVowels(latin, !cyrillic);
}

export function hasCyrillic(text: string): boolean {
  return CYR.test(text);
}

export function hasLatin(text: string): boolean {
  return LATIN.test(text);
}
