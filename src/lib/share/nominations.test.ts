import { describe, expect, it } from "vitest";
import {
  pickNomination,
  timedFromRows,
  type AnswerRow,
  type BuzzRow,
} from "./nominations";

const seats = [
  { id: "a", nickname: "Аня" },
  { id: "b", nickname: "Боря" },
];

function hits(
  playerId: string,
  times: number[],
): { playerId: string; correct: boolean; elapsedMs: number }[] {
  return times.map((elapsedMs) => ({ playerId, correct: true, elapsedMs }));
}

describe("pickNomination", () => {
  it("называет самого быстрого, если отрыв заметный", () => {
    expect(
      pickNomination(seats, [
        ...hits("a", [1200, 1400, 1600]),
        ...hits("b", [2800, 3000, 3200]),
      ]),
    ).toEqual({ title: "Самый быстрый", nickname: "Аня" });
  });

  it("не выбирает, когда скорость почти одна", () => {
    expect(
      pickNomination(seats, [
        ...hits("a", [1500, 1600]),
        ...hits("b", [1700, 1800]),
      ]),
    ).toBeNull();
  });

  it("не хвалит единственного игрока", () => {
    expect(
      pickNomination([seats[0]!], hits("a", [1000, 1100, 1200])),
    ).toBeNull();
  });

  it("без времени берёт самого точного", () => {
    const answers = [
      ...Array.from({ length: 5 }, () => ({
        playerId: "a",
        correct: true,
        elapsedMs: null,
      })),
      ...Array.from({ length: 2 }, () => ({
        playerId: "b",
        correct: true,
        elapsedMs: null,
      })),
    ];
    expect(pickNomination(seats, answers)).toEqual({
      title: "Самый точный",
      nickname: "Аня",
    });
  });

  it("отбрасывает слишком короткие и слишком долгие замеры", () => {
    expect(
      pickNomination(seats, [
        ...hits("a", [50, 80]),
        ...hits("b", [200_000, 300_000]),
      ]),
    ).toBeNull();
  });
});

describe("timedFromRows", () => {
  it("для первого на кнопке считает время до нажатия", () => {
    const answers: AnswerRow[] = [
      {
        playerId: "a",
        questionId: "q",
        verdict: "correct",
        createdAt: "2026-11-28T12:00:05.000Z",
      },
    ];
    const buzzes: BuzzRow[] = [
      {
        playerId: "a",
        questionId: "q",
        first: true,
        at: "2026-11-28T12:00:02.000Z",
      },
    ];
    const opened = new Map([["q", "2026-11-28T12:00:00.000Z"]]);
    expect(timedFromRows(answers, opened, buzzes)).toEqual([
      { playerId: "a", correct: true, elapsedMs: 2000 },
    ]);
  });
});
