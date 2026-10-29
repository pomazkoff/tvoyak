import { describe, expect, it } from "vitest";
import {
  calibrateValue,
  duplicateIndexes,
  safetyFlags,
  leakCheck,
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

describe("leakCheck для черновиков", () => {
  it("отклоняет вопрос с ответом в тексте, теме или транслитом", () => {
    expect(
      leakCheck({
        category: "Блогеры",
        prompt: "Кто ведёт игровой канал Kuplinov Play?",
        answer: "Дмитрий Куплинов",
        variants: ["Куплинов"],
      }).blocking,
    ).toBe(true);
    expect(
      leakCheck({
        category: "Чарты",
        prompt: "Как называется подборка самых популярных треков?",
        answer: "Чарт",
        variants: [],
      }).blocking,
    ).toBe(true);
  });

  it("ловит неправильный вариант, который совпадает с текстом", () => {
    const result = leakCheck({
      category: "Мультфильмы",
      prompt:
        "Какой мультфильм рассказывает о львёнке Симбе — не «Мадагаскар» ли?",
      answer: "Король Лев",
      variants: ["Мадагаскар"],
    });
    expect(result.blocking).toBe(true);
    expect(result.notes).toContain("Мадагаскар");
  });

  it("пропускает честный вопрос, частичные совпадения только помечает", () => {
    const honest = leakCheck({
      category: "Технологии",
      prompt: "Какой браузер Google узнают по цветному кругу?",
      answer: "Chrome",
      variants: ["Google Chrome"],
    });
    expect(honest.blocking).toBe(false);
    expect(honest.notes).toContain("часть ответа");
  });
});

describe("answerDuplicateIndexes", () => {
  it("flags the same answer in the same category, not across categories", async () => {
    const { answerDuplicateIndexes } = await import("@/lib/packs/review");
    expect(
      answerDuplicateIndexes(
        [
          { category: "Кино", answer: "Титаник" },
          { category: "Кино", answer: "титаник!" },
          { category: "Музыка", answer: "Титаник" },
          { category: "Игры", answer: "Minecraft" },
        ],
        [{ category: "Игры", answer: "minecraft" }],
      ),
    ).toEqual([1, 3]);
  });
});
