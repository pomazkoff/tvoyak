import { describe, expect, it } from "vitest";
import {
  KIDS_THEME,
  MIN_AUTO_QUESTIONS,
  balanceNotes,
  inspectBoard,
  parseThemeBoard,
  pickBoard,
  questionsLabel,
  summarizeThemes,
  themeCards,
  themeWarningText,
  type ThemeCandidate,
  type ThemeKind,
} from "@/lib/game/themes";

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mix = Math.imul(state ^ (state >>> 15), 1 | state);
    mix = (mix + Math.imul(mix ^ (mix >>> 7), 61 | mix)) ^ mix;
    return ((mix ^ (mix >>> 14)) >>> 0) / 4294967296;
  };
}

function theme(
  name: string,
  kind: ThemeKind,
  family: string | null = null,
  available = 20,
  unseen = available,
): ThemeCandidate {
  return { name, kind, family, available, unseen };
}

/** Здоровый банк: все типы, «Детский рисунок», разные семейства. */
function fullBank(): ThemeCandidate[] {
  return [
    theme(KIDS_THEME, "picture", "cinema"),
    theme("Логотипы", "picture", "brands"),
    theme("Ребусы", "picture", "word_puzzles"),
    theme("Рок", "music"),
    theme("Джаз", "music"),
    theme("Классика", "music"),
    theme("Клипы", "video", "music_charts"),
    theme("Трейлеры", "video", "cinema"),
    theme("Логика", "brain"),
    theme("Кто это сказал?", "brain"),
    theme("Сколько стоило?", "brain"),
    theme("Кино", "text", "cinema"),
    theme("Книги", "text"),
    theme("Спорт", "text", "sport"),
    theme("Еда", "text"),
    theme("Наука", "text"),
    theme("Мемы", "text", "internet"),
    theme("Игры", "text", "games"),
    theme("Бренды", "text", "brands"),
  ];
}

function kindsOf(names: string[], catalog: ThemeCandidate[]): ThemeKind[] {
  const byName = new Map(catalog.map((item) => [item.name, item.kind]));
  return names.map((name) => byName.get(name) ?? "text");
}

describe("сводка банка", () => {
  it("не считает выключенные картинки и помнит невиденные", () => {
    const catalog = summarizeThemes(
      [
        { id: "1", category: "Кино", picture: null, enabled: false },
        { id: "2", category: "Кино", picture: null, enabled: true },
        { id: "3", category: "Логотипы", picture: "blur", enabled: false },
        { id: "4", category: "Логотипы", picture: "blur", enabled: true },
        { id: "5", category: "Логотипы", picture: "blur", enabled: true },
        { id: "6", category: "  ", picture: null, enabled: true },
      ],
      [
        { category: "Логотипы", kind: "picture", family: "brands" },
        { category: "Кино", kind: "nope", family: null },
      ],
      new Set(["2"]),
    );
    const cinema = catalog.find((item) => item.name === "Кино");
    const logos = catalog.find((item) => item.name === "Логотипы");
    expect(cinema).toMatchObject({
      kind: "text",
      available: 2,
      unseen: 1,
    });
    expect(logos).toMatchObject({
      kind: "picture",
      family: "brands",
      available: 2,
      unseen: 2,
    });
    expect(catalog.some((item) => item.name.trim() === "")).toBe(false);
  });

  it("в список выбора попадают темы хотя бы с пятью вопросами", () => {
    const cards = themeCards([
      theme("Мало", "text", null, 4),
      theme("Впритык", "music", null, 5),
      theme("Много", "video", null, 12),
    ]);
    expect(cards.map((card) => card.name)).toEqual(["Впритык", "Много"]);
    expect(cards.find((card) => card.name === "Впритык")?.thin).toBe(true);
    expect(cards.find((card) => card.name === "Много")?.label).toBe("видео");
  });
});

describe("автоподбор тем", () => {
  it("держит баланс на разных зернах случайности", () => {
    const catalog = fullBank();
    for (let seed = 1; seed <= 40; seed += 1) {
      const picked = pickBoard(catalog, mulberry32(seed));
      expect(picked.ok).toBe(true);
      if (!picked.ok) continue;
      const [first, second] = picked.board.rounds;
      const all = [...first, ...second];
      expect(first).toHaveLength(6);
      expect(second).toHaveLength(6);
      expect(new Set(all).size).toBe(12);
      expect(all).toContain(KIDS_THEME);
      const kinds = kindsOf(all, catalog);
      expect(kinds.filter((kind) => kind === "music")).toHaveLength(2);
      expect(kinds.filter((kind) => kind === "picture")).toHaveLength(2);
      expect(kinds.filter((kind) => kind === "video")).toHaveLength(1);
      expect(kinds.filter((kind) => kind === "brain")).toHaveLength(2);
      expect(kinds.filter((kind) => kind === "text")).toHaveLength(5);
      for (const round of picked.board.rounds) {
        const families = round
          .map((name) => catalog.find((item) => item.name === name)?.family)
          .filter((family): family is string => Boolean(family));
        expect(new Set(families).size).toBe(families.length);
      }
      const pictures = all.filter(
        (name) =>
          catalog.find((item) => item.name === name)?.kind === "picture",
      );
      const pictureFamilies = pictures.map(
        (name) => catalog.find((item) => item.name === name)?.family,
      );
      expect(new Set(pictureFamilies).size).toBe(pictureFamilies.length);
    }
  });

  it("предпочитает невиденные темы", () => {
    const catalog = fullBank().map((item) =>
      item.name === "Классика" ? { ...item, unseen: 0 } : item,
    );
    for (let seed = 1; seed <= 20; seed += 1) {
      const picked = pickBoard(catalog, mulberry32(seed));
      expect(picked.ok).toBe(true);
      if (!picked.ok) continue;
      expect(picked.board.rounds.flat()).not.toContain("Классика");
    }
  });

  it("без видео и музыки ставит текст и не раздувает картинки", () => {
    const catalog = fullBank().filter(
      (item) => item.kind !== "video" && item.kind !== "music",
    );
    const picked = pickBoard(catalog, mulberry32(7));
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    const kinds = kindsOf(picked.board.rounds.flat(), catalog);
    expect(kinds.filter((kind) => kind === "picture")).toHaveLength(2);
    expect(kinds.filter((kind) => kind === "video")).toHaveLength(0);
    expect(kinds.filter((kind) => kind === "music")).toHaveLength(0);
    expect(kinds.filter((kind) => kind === "text").length).toBeGreaterThan(5);
  });

  it("тему с девятью вопросами в автонабор не берёт", () => {
    const catalog = fullBank().map((item) =>
      item.name === "Клипы"
        ? { ...item, available: MIN_AUTO_QUESTIONS - 1 }
        : item,
    );
    const picked = pickBoard(catalog, mulberry32(3));
    expect(picked.ok).toBe(true);
    if (!picked.ok) return;
    expect(picked.board.rounds.flat()).not.toContain("Клипы");
  });

  it("отказывается, если тем меньше двенадцати", () => {
    const picked = pickBoard(fullBank().slice(0, 8), mulberry32(1));
    expect(picked).toEqual({ ok: false, error: "bank_too_small" });
  });
});

describe("проверка выбранного набора", () => {
  const catalog = [
    theme("Кино", "text", null, 20),
    theme("Тонкая", "text", null, 6),
    theme("Пустая", "music", null, 2),
  ];

  it("принимает двенадцать разных названий и отвергает мусор", () => {
    const names = Array.from({ length: 12 }, (_, index) => `Тема ${index}`);
    expect(parseThemeBoard(names)).toEqual(names);
    expect(parseThemeBoard(names.slice(0, 11))).toBeNull();
    expect(parseThemeBoard([...names.slice(0, 11), names[0]])).toBeNull();
    expect(parseThemeBoard([...names.slice(0, 11), "  "])).toBeNull();
    expect(parseThemeBoard("Кино")).toBeNull();
  });

  it("короткую тему блокирует, тонкую только предупреждает", () => {
    const names = [
      "Кино",
      "Тонкая",
      ...Array.from({ length: 10 }, (_, index) => `Нет ${index}`),
    ];
    expect(inspectBoard(names, catalog).problem).toEqual({
      error: "unknown_theme",
      themes: expect.any(Array),
    });
    const short = inspectBoard(
      ["Пустая", ...Array.from({ length: 11 }, (_, index) => `Кино ${index}`)],
      [
        theme("Пустая", "music", null, 2),
        ...Array.from({ length: 11 }, (_, index) =>
          theme(`Кино ${index}`, "text"),
        ),
      ],
    );
    expect(short.problem).toEqual({
      error: "theme_short",
      themes: ["Пустая"],
    });
    const thin = inspectBoard(
      ["Тонкая", ...Array.from({ length: 11 }, (_, index) => `Кино ${index}`)],
      [
        theme("Тонкая", "text", null, 6),
        ...Array.from({ length: 11 }, (_, index) =>
          theme(`Кино ${index}`, "text"),
        ),
      ],
    );
    expect(thin.problem).toBeNull();
    expect(thin.warnings).toEqual([{ name: "Тонкая", questions: 6 }]);
    expect(themeWarningText(thin.warnings[0]!)).toMatch(/Тонкая/);
    expect(themeWarningText(thin.warnings[0]!)).toMatch(/6 вопросов/);
  });

  it("склоняет число вопросов и замечает лишнюю музыку", () => {
    expect(questionsLabel(1)).toBe("1 вопрос");
    expect(questionsLabel(2)).toBe("2 вопроса");
    expect(questionsLabel(5)).toBe("5 вопросов");
    expect(questionsLabel(11)).toBe("11 вопросов");
    expect(questionsLabel(21)).toBe("21 вопрос");
    const notes = balanceNotes(
      ["Рок", "Джаз", "Классика", "Поп"],
      [
        theme("Рок", "music"),
        theme("Джаз", "music"),
        theme("Классика", "music"),
        theme("Поп", "music"),
      ],
    );
    expect(notes[0]).toMatch(/4/);
  });
});
