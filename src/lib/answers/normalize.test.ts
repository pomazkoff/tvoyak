import { describe, expect, it } from "vitest";
import { checkAnswerLocally } from "@/lib/answers/check";
import { normalizeAnswer } from "@/lib/answers/normalize";

describe("normalizeAnswer", () => {
  it("обрезает пробелы, приводит регистр и схлопывает пробелы", () => {
    expect(normalizeAnswer("  МоСкВа \n  ")).toBe("москва");
  });

  it("заменяет ё на е", () => {
    expect(normalizeAnswer("Ёлка")).toBe("елка");
    expect(normalizeAnswer("ёж")).toBe("еж");
  });

  it("убирает кавычки, пунктуацию и дефисы", () => {
    expect(normalizeAnswer("«Война и мир»!!!")).toBe("война и мир");
    expect(normalizeAnswer("Санкт-Петербург")).toBe("санкт петербург");
    expect(normalizeAnswer("Жанна д'Арк")).toBe("жанна д арк");
  });

  it("оставляет цифры и убирает эмодзи", () => {
    expect(normalizeAnswer("1941 год.")).toBe("1941 год");
    expect(normalizeAnswer("Москва 🎉")).toBe("москва");
  });

  it("снимает знак ударения", () => {
    expect(normalizeAnswer("москва\u0301")).toBe("москва");
  });

  it("возвращает пустую строку для пустого ввода", () => {
    expect(normalizeAnswer("   ---  ")).toBe("");
  });
});

describe("checkAnswerLocally", () => {
  it("принимает точный ответ после нормализации", () => {
    const result = checkAnswerLocally("  Ёлка! ", "елка");
    expect(result.correct).toBe(true);
    expect(result.method).toBe("exact");
    expect(result.scoreEffect).toBe("add");
    expect(result.ambiguous).toBe(false);
    expect(result.similarity).toBe(1);
  });

  it("прощает одну опечатку в достаточно длинном слове", () => {
    const result = checkAnswerLocally("пушкен", "Пушкин");
    expect(result.correct).toBe(true);
    expect(result.method).toBe("fuzzy");
    expect(result.scoreEffect).toBe("add");
  });

  it("принимает ответ, в котором эталон стоит отдельными словами", () => {
    const result = checkAnswerLocally("Александр Пушкин", "Пушкин");
    expect(result.correct).toBe(true);
    expect(result.method).toBe("fuzzy");
  });

  it("отклоняет другой ответ", () => {
    const result = checkAnswerLocally("Париж", "Москва");
    expect(result.correct).toBe(false);
    expect(result.ambiguous).toBe(false);
    expect(result.scoreEffect).toBe("subtract");
  });

  it("помечает близкий ответ как спорный и пока неверный", () => {
    const result = checkAnswerLocally("москвич", "Москва");
    expect(result.correct).toBe(false);
    expect(result.ambiguous).toBe(true);
    expect(result.scoreEffect).toBe("subtract");
  });

  it("не считает опечаткой короткое другое слово", () => {
    const result = checkAnswerLocally("кит", "кот");
    expect(result.correct).toBe(false);
  });

  it("не засчитывает пустой эталон", () => {
    const result = checkAnswerLocally("москва", "   ");
    expect(result.correct).toBe(false);
    expect(result.scoreEffect).toBe("subtract");
  });
});
