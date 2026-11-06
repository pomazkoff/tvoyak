/**
 * Числительные словами → цифры: «четыре» = «4», «сто двадцать три» = «123».
 * Работает по нормализованному тексту (нижний регистр, «ё» → «е»).
 * Слова-множители («тысяча», «миллион») не трогаем — их понимает parsePrice.
 */

const UNITS: Array<[RegExp, number]> = [
  [/^нол(ь|я|ю|ем|е)$|^нул(ь|я|ю|ем|е)$/, 0],
  [/^(один|одна|одно|одну|одного|одной|одному|одним|одном|одни|одних)$/, 1],
  [/^(два|две|двух|двум|двумя)$/, 2],
  [/^(три|трех|трем|тремя)$/, 3],
  [/^(четыре|четырех|четырем|четырьмя)$/, 4],
  [/^(пять|пяти|пятью)$/, 5],
  [/^(шесть|шести|шестью)$/, 6],
  [/^(семь|семи)$/, 7],
  [/^(восемь|восьми|восемью|восьмью)$/, 8],
  [/^(девять|девяти|девятью)$/, 9],
];

const TEENS: Array<[RegExp, number]> = [
  [/^десят(ь|и|ью)$/, 10],
  [/^одиннадцат(ь|и|ью)$/, 11],
  [/^двенадцат(ь|и|ью)$/, 12],
  [/^тринадцат(ь|и|ью)$/, 13],
  [/^четырнадцат(ь|и|ью)$/, 14],
  [/^пятнадцат(ь|и|ью)$/, 15],
  [/^шестнадцат(ь|и|ью)$/, 16],
  [/^семнадцат(ь|и|ью)$/, 17],
  [/^восемнадцат(ь|и|ью)$/, 18],
  [/^девятнадцат(ь|и|ью)$/, 19],
];

const TENS: Array<[RegExp, number]> = [
  [/^двадцат(ь|и|ью)$/, 20],
  [/^тридцат(ь|и|ью)$/, 30],
  [/^сорок$/, 40],
  [/^пятьдесят$|^пятидесяти$/, 50],
  [/^шестьдесят$|^шестидесяти$/, 60],
  [/^семьдесят$|^семидесяти$/, 70],
  [/^восемьдесят$|^восьмидесяти$/, 80],
  [/^девяносто$|^девяноста$/, 90],
];

const HUNDREDS: Array<[RegExp, number]> = [
  [/^(сто|ста)$/, 100],
  [/^(двести|двухсот)$/, 200],
  [/^(триста|трехсот)$/, 300],
  [/^(четыреста|четырехсот)$/, 400],
  [/^(пятьсот|пятисот)$/, 500],
  [/^(шестьсот|шестисот)$/, 600],
  [/^(семьсот|семисот)$/, 700],
  [/^(восемьсот|восьмисот)$/, 800],
  [/^(девятьсот|девятисот)$/, 900],
];

type Kind = "unit" | "teen" | "ten" | "hundred";

function classify(word: string): { kind: Kind; value: number } | null {
  const tables: Array<[Kind, Array<[RegExp, number]>]> = [
    ["unit", UNITS],
    ["teen", TEENS],
    ["ten", TENS],
    ["hundred", HUNDREDS],
  ];
  for (const [kind, table] of tables) {
    const hit = table.find(([pattern]) => pattern.test(word));
    if (hit) return { kind, value: hit[1] };
  }
  return null;
}

const ORDER: Record<Kind, number> = { hundred: 3, ten: 2, teen: 1, unit: 0 };

/** Заменяет группы числительных (до 999) на цифры, остальное не трогает. */
export function numberWordsToDigits(normalized: string): string {
  if (!normalized) return normalized;
  const words = normalized.split(" ");
  const out: string[] = [];
  let sum = 0;
  let last: Kind | null = null;
  const flush = () => {
    if (last !== null) out.push(String(sum));
    sum = 0;
    last = null;
  };
  for (const word of words) {
    const hit = classify(word);
    if (!hit) {
      flush();
      out.push(word);
      continue;
    }
    // «сто двадцать три» складываем; «два три» — два разных числа.
    const fits =
      last !== null &&
      ORDER[hit.kind] < ORDER[last] &&
      !(last === "teen") &&
      !(last === "ten" && hit.kind !== "unit");
    if (!fits) flush();
    sum += hit.value;
    last = hit.kind;
  }
  flush();
  // «ни одной», «ни один» — это ноль, а не единица
  return out.join(" ").replace(/(^| )ни 1(?= |$)/g, "$10");
}

/** Числа (как токены) в нормализованной строке. */
export function numberTokens(normalized: string): string[] {
  return normalized.split(" ").filter((word) => /^\d+$/.test(word));
}
