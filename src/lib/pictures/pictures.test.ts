import { describe, expect, it } from "vitest";
import { REBUSES, EMOJI, HIDDEN } from "../../../scripts/picture-tasks/bank";
import { commonsFileFromUrl, commonsImageUrl, isFreeLicense } from "./commons";
import { normalizeWord, rebusProblems, solveRebus } from "./rebus";
import { oddIndex, renderPicture } from "./render";
import {
  blurPx,
  openTiles,
  pixelBlocks,
  revealProgress,
  zoomScale,
} from "./reveal";
import { looksLikeEmoji, twemojiCode } from "./twemoji";
import { pictureProblems } from "./validate";

describe("ребусы", () => {
  it("читаются по правилам: запятые, замена, переворот, зачёркивание", () => {
    expect(
      solveRebus({
        parts: [
          { t: "pic", emoji: "🚗", word: "машина", cutEnd: 1 },
          { t: "txt", text: "ист" },
        ],
      }),
    ).toBe("МАШИНИСТ");
    expect(
      solveRebus({
        parts: [{ t: "pic", emoji: "🐱", word: "кот", swap: [["К", "Р"]] }],
      }),
    ).toBe("РОТ");
    expect(
      solveRebus({
        parts: [{ t: "pic", emoji: "🐱", word: "кот", flip: true }],
      }),
    ).toBe("ТОК");
    expect(
      solveRebus({ parts: [{ t: "txt", text: "КРОТ", strike: [1] }] }),
    ).toBe("КОТ");
    expect(
      solveRebus({
        parts: [
          { t: "num", text: "100", word: "сто" },
          { t: "txt", text: "Л" },
        ],
      }),
    ).toBe("СТОЛ");
  });

  it("каждый ребус стартового банка однозначно читается в свой ответ", () => {
    for (const item of REBUSES) {
      expect(
        rebusProblems({ parts: item.parts }, item.answer),
        item.answer,
      ).toEqual([]);
    }
  });

  it("ловит неверную склейку и эмодзи не из словаря", () => {
    expect(
      rebusProblems(
        {
          parts: [
            { t: "pic", emoji: "🐱", word: "кот" },
            { t: "txt", text: "А" },
          ],
        },
        "Котлета",
      ).join(),
    ).toContain("читается как «КОТА»");
    expect(
      rebusProblems(
        {
          parts: [
            { t: "pic", emoji: "🐈", word: "кошка" },
            { t: "txt", text: "А" },
          ],
        },
        "Кошкаа",
      ).join(),
    ).toContain("нет в словаре");
    expect(
      rebusProblems(
        {
          parts: [
            { t: "pic", emoji: "🐱", word: "кошка" },
            { t: "txt", text: "А" },
          ],
        },
        "Кошкаа",
      ).join(),
    ).toContain("читается как «кот»");
  });

  it("одна картинка без изменений — не ребус", () => {
    expect(
      rebusProblems({ parts: [{ t: "pic", emoji: "🐱", word: "кот" }] }, "кот"),
    ).not.toEqual([]);
  });

  it("ё и регистр не мешают", () => {
    expect(normalizeWord("Ёжик!")).toBe("ЕЖИК");
  });
});

describe("эмодзи", () => {
  it("коды файлов Twemoji", () => {
    expect(twemojiCode("🐱")).toBe("1f431");
    expect(twemojiCode("☂️")).toBe("2602");
    expect(twemojiCode("🧙‍♂️")).toBe("1f9d9-200d-2642-fe0f");
    expect(twemojiCode("1️⃣")).toBe("31-20e3");
  });

  it("буквы — не эмодзи", () => {
    expect(looksLikeEmoji("🚢")).toBe(true);
    expect(looksLikeEmoji("Т")).toBe(false);
    expect(looksLikeEmoji("1️⃣")).toBe(true);
  });

  it("эмодзи-шифры и «найди лишнее» банка проходят правила формата", () => {
    for (const item of EMOJI) {
      const problems = pictureProblems({
        category: "Эмодзи-шифр",
        prompt: `Эмодзи-шифр: ${item.hint}.`,
        answer: item.answer,
        variants: item.variants ?? [],
        kind: "image",
        picture: "emoji",
        picture_spec: { lines: item.lines },
      });
      expect(problems, item.answer).toEqual([]);
    }
    HIDDEN.forEach((item, index) => {
      const problems = pictureProblems({
        category: "Найди лишнее",
        prompt: "Найди лишнее: что здесь лишнее?",
        answer: item.answer,
        variants: item.variants ?? [],
        kind: "image",
        picture: "hidden",
        picture_spec: {
          base: item.base,
          odd: item.odd,
          cols: item.cols,
          rows: item.rows,
          seed: index + 1,
        },
      });
      expect(problems, item.answer).toEqual([]);
    });
  });
});

describe("сборка SVG", () => {
  const art = () => '<path d="M0 0h36v36H0z"/>';

  it("ребус: запятые, замена и переворот видны, слова-ответа в SVG нет", () => {
    const svg = renderPicture(
      "rebus",
      {
        parts: [
          { t: "pic", emoji: "🐱", word: "кот", swap: [["К", "Р"]], cutEnd: 1 },
        ],
      },
      art,
    )!;
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("К=Р");
    expect(svg).toContain(">,<");
    expect(svg).not.toMatch(/кот|КОТ/);
  });

  it("найди лишнее: ровно один лишний, не на краю", () => {
    const spec = { base: "🍅", odd: "🍎", cols: 7, rows: 4, seed: 5 };
    const index = oddIndex(spec);
    expect(index % 7).toBeGreaterThan(0);
    expect(index % 7).toBeLessThan(6);
    let odd = 0;
    renderPicture("hidden", spec, (emoji) => {
      if (emoji === "🍎") odd += 1;
      return "<g/>";
    });
    expect(odd).toBe(1);
  });

  it("id внутри эмодзи уникальны для каждого вхождения", () => {
    const svg = renderPicture(
      "emoji",
      { lines: [["🚢", "🚢"]] },
      () => '<clipPath id="a"/><use href="#a"/>',
    )!;
    const ids = [...svg.matchAll(/id="([^"]+)"/g)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("раскрытие", () => {
  it("прогресс по серверному времени", () => {
    const opened = new Date(1_000_000).toISOString();
    expect(revealProgress(opened, 20, 1_000_000)).toBe(0);
    expect(revealProgress(opened, 20, 1_010_000)).toBeCloseTo(0.5);
    expect(revealProgress(opened, 20, 1_100_000)).toBe(1);
    expect(revealProgress(opened, 0, 0)).toBe(1);
    expect(revealProgress(null, 20, 0)).toBe(0);
  });

  it("эффекты монотонно слабеют и в конце исчезают", () => {
    expect(blurPx(0)).toBeGreaterThan(blurPx(0.5));
    expect(blurPx(1)).toBe(0);
    expect(pixelBlocks(0)).toBeLessThan(pixelBlocks(0.5));
    expect(pixelBlocks(1)).toBe(0);
    expect(openTiles(0, 12)).toBe(1);
    expect(openTiles(1, 12)).toBe(12);
    expect(zoomScale(0, 5)).toBe(5);
    expect(zoomScale(1, 5)).toBe(1);
  });
});

describe("Commons", () => {
  it("только свободные лицензии", () => {
    for (const name of [
      "CC BY-SA 4.0",
      "CC BY 2.0",
      "CC0",
      "Public domain",
      "FAL",
      "GFDL 1.2",
      "CC BY-SA 3.0 de",
      "MPL 2.0",
    ]) {
      expect(isFreeLicense(name), name).toBe(true);
    }
    for (const name of [
      "Fair use",
      "Non-free logo",
      "",
      "All rights reserved",
    ]) {
      expect(isFreeLicense(name), name).toBe(false);
    }
  });

  it("имя файла из ссылки и обратно", () => {
    const url = commonsImageUrl("Kölner Dom von Osten.jpg");
    expect(commonsFileFromUrl(url)).toBe("Kölner Dom von Osten.jpg");
  });

  it("фото без лицензии и не с Commons не пускаем", () => {
    const problems = pictureProblems({
      category: "Размытое фото",
      prompt: "Размытое фото: животное.",
      answer: "Панда",
      variants: [],
      kind: "image",
      picture: "blur",
      picture_spec: { effect: "blur" },
      reveal_seconds: 18,
      image_url: "https://example.com/panda.jpg",
    });
    expect(problems.join()).toContain("Commons");
    expect(problems.join()).toContain("лицензия");
  });
});
