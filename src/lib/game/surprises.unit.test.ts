import { describe, expect, it } from "vitest";
import {
  SURPRISE_EFFECTS,
  SURPRISE_META,
  SURPRISE_SPEECH,
  activeEffects,
  answerDelta,
  answerFormatOk,
  applyInstantEffect,
  hasLetterA,
  leftNeighbour,
  outcomeLines,
  playerEffects,
  globalEffects,
  scrambleWords,
  shortestNicks,
  stealVictim,
  type EffectRow,
} from "./surprises";

const players = [
  { id: "a", nickname: "Анна", score: 300 },
  { id: "b", nickname: "Bob", score: 900 },
  { id: "c", nickname: "Кир", score: -100 },
  { id: "d", nickname: "Женя", score: 500 },
];

describe("справочник эффектов", () => {
  it("16 эффектов, у каждого есть подписи и фраза", () => {
    expect(SURPRISE_EFFECTS).toHaveLength(16);
    for (const effect of SURPRISE_EFFECTS) {
      const meta = SURPRISE_META[effect];
      expect(meta.title.length).toBeGreaterThan(2);
      expect(meta.speech).toMatch(/^(Сюрприз|Хаос)!/);
    }
    expect(new Set(SURPRISE_SPEECH).size).toBe(16);
  });
  it("баффы, дебаффы и хаос — 6/6/4", () => {
    const count = (kind: string) =>
      SURPRISE_EFFECTS.filter((e) => SURPRISE_META[e].kind === kind).length;
    expect(count("buff")).toBe(6);
    expect(count("debuff")).toBe(6);
    expect(count("chaos")).toBe(4);
  });
});

describe("формат ответа", () => {
  it("КАПС", () => {
    expect(answerFormatOk("caps", "ПУШКИН")).toBe(true);
    expect(answerFormatOk("caps", "PUSHKIN 1799")).toBe(true);
    expect(answerFormatOk("caps", "Пушкин")).toBe(false);
    expect(answerFormatOk("caps", "пушкин")).toBe(false);
  });
  it("одно слово", () => {
    expect(answerFormatOk("one_word", "Пушкин")).toBe(true);
    expect(answerFormatOk("one_word", "  Пушкин ")).toBe(true);
    expect(answerFormatOk("one_word", "Александр Пушкин")).toBe(false);
    expect(answerFormatOk("one_word", "   ")).toBe(false);
  });
});

describe("буква «а»", () => {
  it("кириллица и латиница, любой регистр", () => {
    expect(hasLetterA("Анна")).toBe(true);
    expect(hasLetterA("ANTON")).toBe(true);
    expect(hasLetterA("bAb")).toBe(true);
    expect(hasLetterA("Кир")).toBe(false);
    expect(hasLetterA("Bob")).toBe(false);
  });
});

describe("мгновенные эффекты", () => {
  it("letter_a: +1000 только если есть «а»", () => {
    expect(applyInstantEffect("letter_a", players, "a").a).toBe(1300);
    expect(applyInstantEffect("letter_a", players, "c").c).toBe(-100);
  });
  it("steal: у лидера, а лидер крадёт у второго", () => {
    const fromLeader = applyInstantEffect("steal", players, "c");
    expect(fromLeader.b).toBe(400);
    expect(fromLeader.c).toBe(400);
    expect(stealVictim(players, "b")?.id).toBe("d");
    const leader = applyInstantEffect("steal", players, "b");
    expect(leader.b).toBe(1400);
    expect(leader.d).toBe(0);
  });
  it("swap_left: сосед слева, по кругу", () => {
    expect(leftNeighbour(players, "b")?.id).toBe("a");
    expect(leftNeighbour(players, "a")?.id).toBe("d");
    const swapped = applyInstantEffect("swap_left", players, "a");
    expect(swapped.a).toBe(500);
    expect(swapped.d).toBe(300);
    expect(swapped.b).toBe(900);
  });
  it("shortest_nick: всем с самым коротким именем", () => {
    expect(shortestNicks(players).map((p) => p.id)).toEqual(["b", "c"]);
    const next = applyInstantEffect("shortest_nick", players, "a");
    expect(next.b).toBe(400);
    expect(next.c).toBe(-600);
    expect(next.a).toBe(300);
  });
  it("rotate: каждый получает счёт соседа слева", () => {
    const next = applyInstantEffect("rotate", players, "a");
    expect(next).toEqual({ a: 500, b: 300, c: 900, d: -100 });
    const total = (o: Record<string, number>) =>
      Object.values(o).reduce((s, v) => s + v, 0);
    expect(total(next)).toBe(total(applyInstantEffect("double", players, "a")));
  });
  it("robin_hood: последнему +1500 (всем при ничьей)", () => {
    expect(applyInstantEffect("robin_hood", players, "a").c).toBe(1400);
    const tied = [
      { id: "x", nickname: "X", score: 0 },
      { id: "y", nickname: "Y", score: 0 },
      { id: "z", nickname: "Z", score: 100 },
    ];
    expect(applyInstantEffect("robin_hood", tied, "z")).toEqual({
      x: 1500,
      y: 1500,
      z: 100,
    });
  });
  it("отложенные эффекты не трогают счёт сразу", () => {
    for (const effect of [
      "double",
      "shield",
      "hint",
      "freeze",
      "triple",
    ] as const) {
      expect(applyInstantEffect(effect, players, "a")).toEqual({
        a: 300,
        b: 900,
        c: -100,
        d: 500,
      });
    }
  });
});

describe("очки за ответ", () => {
  it("×2 только на верный", () => {
    expect(answerDelta({ value: 300, correct: true, double: true })).toEqual({
      delta: 600,
      usedDouble: true,
      usedShield: false,
    });
    expect(
      answerDelta({ value: 300, correct: false, double: true }).delta,
    ).toBe(-300);
  });
  it("щит обнуляет минус", () => {
    expect(answerDelta({ value: 300, correct: false, shield: true })).toEqual({
      delta: 0,
      usedDouble: false,
      usedShield: true,
    });
    expect(
      answerDelta({ value: 300, correct: true, shield: true }).usedShield,
    ).toBe(false);
  });
  it("×3 и в плюс, и в минус; складывается с ×2", () => {
    expect(answerDelta({ value: 200, correct: true, triple: true }).delta).toBe(
      600,
    );
    expect(
      answerDelta({ value: 200, correct: false, triple: true }).delta,
    ).toBe(-600);
    expect(
      answerDelta({ value: 200, correct: true, triple: true, double: true })
        .delta,
    ).toBe(1200);
  });
});

describe("перемешка", () => {
  const text = "Этот поэт написал роман в стихах Евгений Онегин";
  it("детерминирована и меняет порядок, сохраняя слова", () => {
    const one = scrambleWords(text, "q1");
    expect(scrambleWords(text, "q1")).toBe(one);
    expect(one).not.toBe(text);
    expect(one.split(" ").sort()).toEqual(text.split(" ").sort());
  });
  it("два слова — всегда переставлены", () => {
    for (const seed of ["a", "b", "c", "d", "e"]) {
      expect(scrambleWords("Кто там", seed)).toBe("там Кто");
    }
    expect(scrambleWords("Одно", "x")).toBe("Одно");
  });
});

describe("бейджи", () => {
  const rows: EffectRow[] = [
    {
      id: "1",
      player_id: "a",
      effect: "double",
      question_id: null,
      status: "active",
    },
    {
      id: "2",
      player_id: "a",
      effect: "hint",
      question_id: "q1",
      status: "active",
    },
    {
      id: "3",
      player_id: null,
      effect: "triple",
      question_id: "q1",
      status: "active",
    },
    {
      id: "4",
      player_id: "b",
      effect: "shield",
      question_id: null,
      status: "used",
    },
    {
      id: "5",
      player_id: "b",
      effect: "pick_next",
      question_id: "q1",
      status: "active",
    },
  ];
  it("эффекты вопроса — только на своём вопросе", () => {
    expect(playerEffects(rows, "a", "q1")).toEqual(["double", "hint"]);
    expect(playerEffects(rows, "a", "q2")).toEqual(["double"]);
    expect(globalEffects(rows, "q1")).toEqual(["triple"]);
    expect(globalEffects(rows, null)).toEqual([]);
  });
  it("использованные не показываются; выбор хода — до следующей клетки", () => {
    expect(playerEffects(rows, "b", null)).toEqual(["pick_next"]);
    expect(activeEffects(rows, "q1")).toHaveLength(4);
  });
});

describe("итог рулетки", () => {
  it("строки изменений счёта", () => {
    expect(
      outcomeLines(
        {
          effect: "steal",
          status: "done",
          outcome: {
            changes: [
              { player_id: "b", nickname: "Bob", delta: -500, score: 400 },
              { player_id: "c", nickname: "Кир", delta: 500, score: 400 },
            ],
          },
        },
        "Кир",
      ),
    ).toEqual(["Bob: -500 → 400", "Кир: +500 → 400"]);
  });
  it("буква «а» без «а»", () => {
    expect(
      outcomeLines(
        {
          effect: "letter_a",
          status: "done",
          outcome: { nothing: true, changes: [] },
        },
        "Кир",
      ),
    ).toEqual(["В имени Кир нет «а» — ничего."]);
  });
});
