import { describe, expect, it } from "vitest";
import { checkAgainstVariants, needsLlm } from "@/lib/answers/check";
import { judgeMessages, parseJudgeReply } from "@/lib/answers/judge-prompt";
import { fixLookalikes, phoneticKey } from "@/lib/answers/translit";

// Ответы из игр 29–31 октября 2026, которые раньше засчитывались неверными,
// хотя по смыслу правильные. [ответ игрока, эталон, варианты]
const REAL_FALSE_NEGATIVES: Array<[string, string, string[]]> = [
  ["Instagram", "Инстаграм", []],
  ["Блютуз ", "Bluetooth", []],
  ["Мессенджер", "Messenger", []],
  ["Хамали и наваи ", "HammAli & Navai", ["HammAli & Navai"]],
  ["Тьерсен", "Ян Тирсен", ["Yann Tiersen"]],
];

// Тот же смысл другими словами, латиница/кириллица, порядок слов.
const MORE_SAME_ANSWERS: Array<[string, string, string[]]> = [
  ["Нью джинс", "NewJeans", []],
  ["New Jeans", "NewJeans", []],
  ["Гаррикс Мартин", "Martin Garrix", []],
  ["Мартин Гарикс", "Martin Garrix", []],
  ["Армин ван Бурен", "Armin van Buuren", []],
  ["Армстронг", "Нил Армстронг", []],
  ["Лайн", "Line", []],
  ["Геншин импакт", "Genshin Impact", []],
  ["Каунтер страйк", "Counter-Strike", []],
  ["Ютуб", "YouTube", []],
  ["Фейсбук", "Facebook", []],
  ["Вотсап", "WhatsApp", []],
  ["Тик ток", "TikTok", []],
  ["Майкрософт", "Microsoft", []],
  ["Битлз", "The Beatles", []],
  ["Beatles", "The Beatles", []],
  ["Квин", "Queen", []],
  ["Металлика", "Metallica", []],
  ["Рамштайн", "Rammstein", []],
  ["Дворжак", "Dvořák", []],
  ["Cтатуя Свободы", "Статуя Свободы", []], // латинская C
  ["Пepу", "Перу", []], // латинские e и p
  ["Шерлок Холмс", "Sherlock Holmes", []],
  ["Эминем", "Eminem", []],
  ["Тейлор Свифт", "Taylor Swift", []],
  ["Свифт", "Taylor Swift", []],
  ["Найк", "Nike", []],
  ["Чикаго", "Chicago", []],
  ["Петербург", "Санкт-Петербург", []],
  ["Руки в верх", "Руки Вверх", []],
  ["Titanic", "Титаник", []],
  ["Ratatouille", "Рататуй", []],
  ["Stranger Things", "Очень странные дела", ["Stranger Things"]],
];

// Разные ответы — должны остаться неверными без LLM.
const MUST_STAY_WRONG: Array<[string, string, string[]]> = [
  ["Евро", "Лига чемпионов", ["Champions League", "ЛЧ"]],
  ["Кит", "Кот", []],
  ["Пим", "Пин", []],
  ["Лу", "Луффи", ["Монки Д. Луффи", "Luffy"]],
  ["Австрия", "Австралия", []],
  ["Корея", "Северная Корея", []],
  ["Новгород", "Нижний Новгород", []],
  ["спорт", "Санный спорт", []],
  ["скелетон, бобслей", "Санный спорт", []],
  ["Тормоз", "Тормозной диск", []],
  ["Тормозной диск", "Тормоз", []],
  ["Martin Garix", "Армин ван Бюрен", ["Armin van Buuren"]],
  ["Авичи", "Martin Garrix", ["Мартин Гаррикс", "Гаррикс"]],
  ["Ганс", "Гатс", ["Guts"]],
  ["Москвич", "Москва", []],
  ["Тикток", "Likee", []],
  ["Blackpink", "NewJeans", ["Нью Джинс"]],
  ["Агутин", "Андрей Губин", ["Губин"]],
  ["Климат контроль", "Круиз-контроль", []],
  ["Ролан гаррос", "Уимблдон", ["Wimbledon"]],
  ["Ed Sheeran", "Сэм Смит", ["Sam Smith"]],
  ["Line", "Lime", []],
  ["Мир", "Мир Дикого Запада", []],
  ["не Моцарт", "Моцарт", []],
  ["Джон Леннон", "Пол Маккартни", []],
  ["Пол Маккартни", "Джон Маккартни", []],
  ["Ариана Гранде", "Рианна", ["Rihanna"]],
  ["Sony", "Ёж Соник", ["Соник", "Sonic"]],
  ["Баста", "Каста", ["Kasta"]],
  ["Хабиб", "Jah Khalib", ["Джах Халиб"]],
  ["Медведь", "Маша и Медведь", []],
  ["Отвлекающийся парень", "Карен", []],
];

describe("синонимы и транслит: реальные ложные «неверно»", () => {
  it.each(REAL_FALSE_NEGATIVES)("«%s» = «%s»", (given, expected, variants) => {
    expect(checkAgainstVariants(given, expected, variants).correct).toBe(true);
  });

  it.each(MORE_SAME_ANSWERS)("«%s» = «%s»", (given, expected, variants) => {
    expect(checkAgainstVariants(given, expected, variants).correct).toBe(true);
  });
});

describe("синонимы и транслит: разные ответы не склеиваются", () => {
  it.each(MUST_STAY_WRONG)("«%s» ≠ «%s»", (given, expected, variants) => {
    expect(checkAgainstVariants(given, expected, variants).correct).toBe(false);
  });

  it("другое число — точно мимо, даже если вариант без числа похож", () => {
    for (const [given, expected, variants] of [
      ["2 копейки", "1 копейка", ["1", "одна копейка", "копейка"]],
      [
        "44 миллиарда долларов",
        "1 миллиард долларов",
        ["1 млрд", "миллиард долларов"],
      ],
      ["1000000", "1 миллиард долларов", ["1 млрд", "1000000000"]],
    ] as const) {
      const result = checkAgainstVariants(given, expected, [...variants]);
      expect(result.correct).toBe(false);
      expect(needsLlm(result)).toBe(false);
    }
  });
});

describe("когда спрашивать LLM", () => {
  it("перевод и другое название идут к LLM, хоть строки и не похожи", () => {
    // Раньше: сходство < 0.55 → «неверно» без LLM.
    for (const [given, expected] of [
      ["Stranger things", "Очень странные дела"],
      ["Твиттер", "X"],
      ["abs", "Антиблокировочная система"],
      ["На березе яблоки не растут", "Нисколько — на берёзе не растут яблоки"],
    ]) {
      const result = checkAgainstVariants(given, expected, []);
      expect(result.correct).toBe(false);
      expect(needsLlm(result)).toBe(true);
    }
  });

  it("отписки к LLM не идут", () => {
    for (const given of ["не знаю", "Хз", "?", "я не знаю"]) {
      expect(needsLlm(checkAgainstVariants(given, "Моцарт", []))).toBe(false);
    }
  });
});

describe("translit", () => {
  it("сводит латиницу и кириллицу к одному ключу", () => {
    expect(phoneticKey("instagram")).toBe(phoneticKey("инстаграм"));
    expect(phoneticKey("garrix")).toBe(phoneticKey("гаррикс"));
    expect(phoneticKey("queen")).toBe(phoneticKey("квин"));
    expect(phoneticKey("кот")).not.toBe(phoneticKey("кит"));
  });

  it("чинит буквы-двойники только в смешанных словах", () => {
    expect(fixLookalikes("Cтатуя")).toBe("Статуя");
    expect(fixLookalikes("Pоcket")).toBe("Pocket");
    expect(fixLookalikes("Москва London")).toBe("Москва London");
  });
});

describe("промпт LLM-судьи", () => {
  it("передаёт вопрос, тему, варианты и особое правило", () => {
    const [system, user] = judgeMessages({
      given: "Stranger things",
      expected: "Очень странные дела",
      variants: ["ОСД"],
      question: "Какой сериал про подростков-детективов?",
      category: "Сериалы",
      note: "Только то же слово.",
    });
    expect(system?.content).toContain("переводе");
    expect(system?.content).toContain("транслитерации");
    expect(system?.content).toContain("Только то же слово.");
    expect(user?.content).toContain("Вопрос: Какой сериал");
    expect(user?.content).toContain("Тоже верно: ОСД");
    expect(user?.content).toContain("Ответ игрока: Stranger things");
  });

  it("разбирает ответ модели", () => {
    expect(parseJudgeReply('```json\n{"correct": true}\n```')).toBe(true);
    expect(parseJudgeReply('{"correct":false}')).toBe(false);
    expect(() => parseJudgeReply("да")).toThrow();
  });
});
