import { describe, expect, it } from "vitest";
import { displayPrompt } from "@/lib/game/prompt";

describe("displayPrompt", () => {
  it("убирает служебный номер и поднимает первую букву", () => {
    expect(displayPrompt("Детский рисунок № 17: что нарисовал ребёнок?")).toBe(
      "Что нарисовал ребёнок?",
    );
    expect(displayPrompt("Один пиксель № 1: знаменитая картина.")).toBe(
      "Знаменитая картина.",
    );
    expect(displayPrompt("Найди лишнее №3. Что здесь лишнее?")).toBe(
      "Что здесь лишнее?",
    );
  });

  it("не трогает обычные вопросы", () => {
    expect(displayPrompt("Кто носил футболку с № 10 в «Барселоне»?")).toBe(
      "Кто носил футболку с № 10 в «Барселоне»?",
    );
    expect(displayPrompt("Сколько стоил ВАЗ-2101?")).toBe(
      "Сколько стоил ВАЗ-2101?",
    );
    expect(displayPrompt(null)).toBeNull();
  });
});
