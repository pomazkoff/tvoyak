import { describe, expect, it } from "vitest";
import { verdictLine } from "@/lib/game/verdict-speech";

describe("голос вердикта", () => {
  it("верный ответ: «Верно!» и ответ", () => {
    expect(
      verdictLine({
        from: "judging",
        to: "reveal",
        before: { a: 0 },
        after: { a: 200 },
        answer: "Офис",
      }),
    ).toBe("Верно! Правильный ответ: Офис.");
  });
  it("неверный ответ, кнопка снова открыта: «Неверно.»", () => {
    expect(
      verdictLine({
        from: "answering",
        to: "buzzing",
        before: { a: 0 },
        after: { a: -100 },
        answer: null,
      }),
    ).toBe("Неверно.");
  });
  it("никто не ответил: только правильный ответ", () => {
    expect(
      verdictLine({
        from: "buzzing",
        to: "reveal",
        before: { a: 0 },
        after: { a: 0 },
        answer: "Друзья",
      }),
    ).toBe("Правильный ответ: Друзья.");
  });
  it("прочие переходы молчат", () => {
    expect(
      verdictLine({
        from: "question",
        to: "buzzing",
        before: {},
        after: {},
        answer: null,
      }),
    ).toBeNull();
    expect(
      verdictLine({
        from: "reveal",
        to: "board",
        before: {},
        after: {},
        answer: "x",
      }),
    ).toBeNull();
  });
});
