import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  closeTogetherQuestion,
  isTogether,
  liveMultiplierLabel,
  minPlayers,
  missNote,
  nextMultiplier,
  parsePlayMode,
  recordLine,
  streakMultiplier,
} from "@/lib/game/together";

describe("режим «Вместе»", () => {
  it("по умолчанию остаётся соревнование", () => {
    expect(parsePlayMode(undefined)).toBe("versus");
    expect(parsePlayMode("versus")).toBe("versus");
    expect(parsePlayMode("together")).toBe("together");
    expect(parsePlayMode("coop")).toBeNull();
    expect(isTogether("together")).toBe(true);
    expect(isTogether(undefined)).toBe(false);
    expect(minPlayers("versus")).toBe(2);
    expect(minPlayers("together")).toBe(1);
  });

  it("множитель серии растёт до ×3 и дальше не растёт", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(1)).toBe(1);
    expect(streakMultiplier(2)).toBe(2);
    expect(streakMultiplier(3)).toBe(3);
    expect(streakMultiplier(9)).toBe(3);
    expect(nextMultiplier(0)).toBe(1);
    expect(nextMultiplier(1)).toBe(2);
    expect(nextMultiplier(2)).toBe(3);
    expect(nextMultiplier(8)).toBe(3);
  });

  it("верный ответ один раз прибавляет номинал × серию", () => {
    const first = closeTogetherQuestion({
      value: 200,
      correct: true,
      streak: 0,
      bestStreak: 0,
      score: 0,
      correctCount: 0,
      played: 0,
    });
    expect(first).toMatchObject({
      points: 200,
      multiplier: 1,
      score: 200,
      streak: 1,
      bestStreak: 1,
      correct: 1,
      played: 1,
    });

    const third = closeTogetherQuestion({
      value: 400,
      correct: true,
      streak: 2,
      bestStreak: 2,
      score: 500,
      correctCount: 2,
      played: 2,
    });
    expect(third.points).toBe(1200);
    expect(third.multiplier).toBe(3);
    expect(third.score).toBe(1700);
    expect(third.streak).toBe(3);
    expect(third.correct).toBe(3);
  });

  it("промах команды обнуляет серию и не снимает очки", () => {
    const missed = closeTogetherQuestion({
      value: 500,
      correct: false,
      streak: 3,
      bestStreak: 3,
      score: 900,
      correctCount: 4,
      played: 5,
    });
    expect(missed).toMatchObject({
      points: 0,
      score: 900,
      streak: 0,
      bestStreak: 3,
      correct: 4,
      played: 6,
    });
  });

  it("рекорд компании звучит по-человечески", () => {
    expect(recordLine(400, null)).toBe("Пока это лучший результат.");
    expect(recordLine(900, 400)).toBe("Новый рекорд! Раньше было 400.");
    expect(recordLine(400, 900)).toBe("Рекорд компании — 900.");
    expect(liveMultiplierLabel(0)).toMatch(/серию/);
    expect(liveMultiplierLabel(1)).toBe("Серия 1 · этот вопрос ×2");
    expect(liveMultiplierLabel(4)).toBe("Серия 4 · этот вопрос ×3");
    expect(missNote()).toMatch(/кто-то ещё/i);
  });

  it("миграция обратно совместима и не роняет старый режим", () => {
    const sql = readFileSync(
      "supabase/migrations/20261127180000_together_mode.sql",
      "utf8",
    );
    expect(sql).toContain("default 'versus'");
    expect(sql).toContain(
      "case when v_room.play_mode = 'together' then 1 else 2 end",
    );
    expect(sql).toContain("together_resolve");
    expect(sql).toContain("least(greatest(v_streak, 1), 3)");
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).toContain("if not exists");
  });
});
