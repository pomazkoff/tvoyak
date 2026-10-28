import { describe, expect, it } from "vitest";
import {
  calibrateValue,
  duplicateIndexes,
  safetyFlags,
} from "@/lib/packs/review";

describe("проверка пачки", () => {
  it("округляет сложность к стоимости 100–1000", () => {
    expect(calibrateValue(90)).toBe(100);
    expect(calibrateValue(450)).toBe(400);
    expect(calibrateValue(950)).toBe(1000);
    expect(calibrateValue(Number.NaN)).toBe(100);
  });

  it("отмечает политику и темы 18+", () => {
    expect(safetyFlags("хит про котиков")).toEqual([]);
    expect(safetyFlags("вопрос про выборы президента")).toEqual(
      expect.arrayContaining(["выбор", "президент"]),
    );
    expect(safetyFlags("порно-актриса")).toContain("порно");
  });

  it("находит повтор внутри пачки и в уже сыгранном пуле", () => {
    const indexes = duplicateIndexes(
      ["Кто поёт Shape of You?", "Кто поет shape of you", "Новый вопрос"],
      ["Новый вопрос"],
    );
    expect(indexes).toEqual([1, 2]);
  });
});
