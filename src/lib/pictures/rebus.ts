import type { RebusPart, RebusSpec } from "./types";

/**
 * Словарь картинок для ребусов: эмодзи → какими словами его можно прочитать.
 * В ребусах разрешены только эти эмодзи и только эти прочтения — так ребус
 * читается однозначно (никаких «кот или кошка?»).
 */
export const REBUS_EMOJI: Record<string, string[]> = {
  "🐱": ["кот"],
  "🦷": ["зуб"],
  "🍋": ["лимон"],
  "🦆": ["утка"],
  "🌹": ["роза"],
  "🐟": ["рыба"],
  "🎈": ["шар"],
  "👃": ["нос"],
  "🚗": ["машина"],
  "🦉": ["сова"],
  "🦊": ["лиса"],
  "🌙": ["луна"],
  "🐋": ["кит"],
  "☂️": ["зонт"],
  "🏠": ["дом"],
  "🧀": ["сыр"],
  "🦁": ["лев"],
  "🕷️": ["паук"],
  "🐘": ["слон"],
  "🐝": ["пчела"],
  "🐍": ["змея"],
  "🦀": ["краб"],
  "🍉": ["арбуз"],
  "🍐": ["груша"],
  "🌳": ["дерево"],
  "⚽": ["мяч"],
  "🔑": ["ключ"],
  "🐌": ["улитка"],
  "🐺": ["волк"],
  "🐮": ["корова"],
  "🐜": ["муравей"],
  "🦌": ["олень"],
  "🐢": ["черепаха"],
  "🍄": ["гриб"],
  "🔥": ["огонь"],
  "⭐": ["звезда"],
  "🌊": ["волна"],
  "🎁": ["подарок"],
  "📖": ["книга"],
  "🐓": ["петух"],
  "🦢": ["лебедь"],
  "🐧": ["пингвин"],
  "🍒": ["вишня"],
  "🥕": ["морковь"],
  "🧅": ["лук"],
  "🌰": ["орех"],
  "🛏️": ["кровать"],
  "🪑": ["стул"],
  "✂️": ["ножницы"],
  "💧": ["капля"],
  "☀️": ["солнце"],
  "🐐": ["коза"],
  "🐑": ["овца"],
  "🦔": ["ёж"],
  "🐸": ["лягушка"],
  "🍞": ["хлеб"],
};

/** Числа для ребусов: цифры → слово. */
export const REBUS_NUMBERS: Record<string, string> = {
  "1": "один",
  "2": "два",
  "3": "три",
  "4": "четыре",
  "5": "пять",
  "6": "шесть",
  "7": "семь",
  "8": "восемь",
  "9": "девять",
  "10": "десять",
  "40": "сорок",
  "100": "сто",
  "1000": "тысяча",
};

export function normalizeWord(value: string): string {
  return value
    .toLocaleUpperCase("ru-RU")
    .replaceAll("Ё", "Е")
    .replace(/[^A-ZА-Я0-9]/g, "");
}

function readPart(part: RebusPart): string {
  if (part.t === "num") return normalizeWord(part.word);
  if (part.t === "txt") {
    const strike = new Set(part.strike ?? []);
    return Array.from(normalizeWord(part.text))
      .filter((_, index) => !strike.has(index))
      .join("");
  }
  let word = normalizeWord(part.word);
  if (part.flip) word = Array.from(word).reverse().join("");
  for (const [from, to] of part.swap ?? []) {
    word = word.replaceAll(normalizeWord(from), normalizeWord(to));
  }
  const start = part.cutStart ?? 0;
  const end = part.cutEnd ?? 0;
  return word.slice(start, word.length - end);
}

/** Как читается ребус — буквами, без пробелов. */
export function solveRebus(spec: RebusSpec): string {
  return spec.parts.map(readPart).join("");
}

/** Почему ребус нельзя пускать в игру; пустой список — можно. */
export function rebusProblems(spec: unknown, answer: string): string[] {
  const problems: string[] = [];
  const parts = (spec as RebusSpec | null)?.parts;
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 5) {
    return ["ребус: нужно от 1 до 5 частей"];
  }
  // Одна картинка — только если с ней что-то сделано (замена, переворот,
  // запятые), иначе это не ребус, а «назови картинку».
  if (parts.length === 1) {
    const only = parts[0];
    const changed =
      only?.t === "pic" &&
      (Boolean(only.swap?.length) ||
        only.flip ||
        (only.cutStart ?? 0) > 0 ||
        (only.cutEnd ?? 0) > 0);
    if (!changed)
      return [
        "ребус: одна часть — только картинка с заменой, переворотом или запятыми",
      ];
  }
  let pictures = 0;
  for (const part of parts) {
    if (part?.t === "pic") {
      pictures += 1;
      const words = REBUS_EMOJI[part.emoji];
      if (!words) {
        problems.push(`ребус: эмодзи ${part.emoji} нет в словаре однозначных`);
      } else if (!words.includes(part.word.toLocaleLowerCase("ru-RU"))) {
        problems.push(
          `ребус: ${part.emoji} читается как «${words.join("/")}», а не «${part.word}»`,
        );
      }
      const length = normalizeWord(part.word).length;
      const cut = (part.cutStart ?? 0) + (part.cutEnd ?? 0);
      if (cut < 0 || cut >= length - 1) {
        problems.push("ребус: запятыми убрано почти всё слово");
      }
      if ((part.cutStart ?? 0) > 3 || (part.cutEnd ?? 0) > 3) {
        problems.push("ребус: больше трёх запятых не читаются");
      }
      for (const [from] of part.swap ?? []) {
        if (!normalizeWord(part.word).includes(normalizeWord(from))) {
          problems.push(`ребус: в слове «${part.word}» нет буквы ${from}`);
        }
      }
    } else if (part?.t === "num") {
      if (REBUS_NUMBERS[part.text] !== part.word.toLocaleLowerCase("ru-RU")) {
        problems.push(
          `ребус: число ${part.text} не читается как «${part.word}»`,
        );
      }
    } else if (part?.t === "txt") {
      if (!normalizeWord(part.text)) problems.push("ребус: пустые буквы");
    } else {
      problems.push("ребус: неизвестная часть");
    }
  }
  if (pictures === 0 && !parts.some((part) => part.t === "num")) {
    problems.push("ребус: нужна хотя бы одна картинка или число");
  }
  const solved = solveRebus({ parts });
  if (solved !== normalizeWord(answer)) {
    problems.push(`ребус читается как «${solved}», а ответ «${answer}»`);
  }
  return problems;
}
