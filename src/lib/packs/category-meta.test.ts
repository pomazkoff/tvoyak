import { describe, expect, it } from "vitest";

import { categoryKindFromRows, categoryMetaRows } from "./category-meta";

describe("categoryKindFromRows", () => {
  it("тема без медиа — text", () => {
    expect(categoryKindFromRows("Наука", [{ kind: "text" }])).toBe("text");
  });

  it("картиночные задания — picture", () => {
    expect(
      categoryKindFromRows("Новая картинка", [
        { picture: "rebus" },
        { picture: "rebus" },
        { kind: "text" },
      ]),
    ).toBe("picture");
  });

  it("аудио большинства вопросов — music", () => {
    expect(
      categoryKindFromRows("Инди", [
        { audio_url: "https://a/1.m4a" },
        { audio_url: "https://a/2.m4a" },
        { kind: "text" },
        { kind: "text" },
      ]),
    ).toBe("music");
  });

  it("видео большинства вопросов — video", () => {
    expect(
      categoryKindFromRows("Реклама", [
        { youtube_id: "abc" },
        { vk_url: "https://vk.com/video1_2" },
        { kind: "text" },
      ]),
    ).toBe("video");
  });

  it("меньшинство медиа — остаётся text", () => {
    expect(
      categoryKindFromRows("Мультики", [
        { youtube_id: "abc" },
        { kind: "text" },
        { kind: "text" },
      ]),
    ).toBe("text");
  });

  it("особые текстовые форматы — brain, особые медийные — свой тип", () => {
    expect(categoryKindFromRows("Логика с подвохом", [{}])).toBe("brain");
    expect(categoryKindFromRows("Звук наоборот", [])).toBe("music");
    expect(categoryKindFromRows("Голос из прошлого", [])).toBe("video");
  });
});

describe("categoryMetaRows", () => {
  it("одна строка на тему", () => {
    expect(
      categoryMetaRows([
        { category: "A", kind: "text" },
        { category: "A", audio_url: "x" },
        { category: "A", audio_url: "y" },
        { category: "B", kind: "text" },
      ]),
    ).toEqual([
      { category: "A", kind: "music", family: null },
      { category: "B", kind: "text", family: null },
    ]);
  });
});
