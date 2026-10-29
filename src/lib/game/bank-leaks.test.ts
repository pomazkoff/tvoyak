import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  findAnswerLeaks,
  hasBlockingLeak,
  promptContainsAnswer,
  soundSkeleton,
} from "@/lib/game/bank-leaks";

type BankRow = {
  category: string;
  prompt: string;
  answer: string;
  variants: string[];
};

function readSqlString(source: string, from: number) {
  const start = source.indexOf("'", from);
  if (start < 0) return null;
  let index = start + 1;
  let value = "";
  while (index < source.length) {
    if (source[index] === "'" && source[index + 1] === "'") {
      value += "'";
      index += 2;
      continue;
    }
    if (source[index] === "'") return { value, end: index + 1 };
    value += source[index];
    index += 1;
  }
  return null;
}

function parseBankInserts(sql: string): BankRow[] {
  const rows: BankRow[] = [];
  let index = 0;
  while (index < sql.length) {
    if (sql[index] !== "(" || sql[index + 1] !== "'") {
      index += 1;
      continue;
    }
    const tuple: unknown[] = [];
    index += 1;
    while (index < sql.length && sql[index] !== ")") {
      while (index < sql.length && " \n\r\t,".includes(sql[index])) index += 1;
      if (sql[index] === ")") break;
      if (sql.startsWith("array[", index) || sql.startsWith("ARRAY[", index)) {
        const start = sql.indexOf("[", index);
        const end = sql.indexOf("]", start);
        const inner = sql.slice(start + 1, end);
        const variants: string[] = [];
        let cursor = 0;
        while (cursor < inner.length) {
          if (inner[cursor] !== "'") {
            cursor += 1;
            continue;
          }
          const parsed = readSqlString(inner, cursor);
          if (!parsed) break;
          variants.push(parsed.value);
          cursor = parsed.end;
        }
        tuple.push(variants);
        index = end + 1;
        if (sql.startsWith("::text[]", index)) index += "::text[]".length;
      } else if (sql[index] === "'") {
        const parsed = readSqlString(sql, index);
        if (!parsed) break;
        tuple.push(parsed.value);
        index = parsed.end;
      } else if (sql.startsWith("null", index)) {
        tuple.push(null);
        index += 4;
      } else if (sql.startsWith("true", index)) {
        tuple.push(true);
        index += 4;
      } else if (sql.startsWith("false", index)) {
        tuple.push(false);
        index += 5;
      } else if (sql[index] === "-" || /[0-9]/.test(sql[index])) {
        let number = "";
        if (sql[index] === "-") number += sql[index++];
        while (index < sql.length && /[0-9]/.test(sql[index]))
          number += sql[index++];
        tuple.push(Number(number));
      } else index += 1;
    }
    if (typeof tuple[1] === "string" && typeof tuple[2] === "string") {
      rows.push({
        category: String(tuple[0]),
        prompt: tuple[1],
        answer: tuple[2],
        variants: Array.isArray(tuple[3]) ? (tuple[3] as string[]) : [],
      });
    }
    index += 1;
  }
  return rows;
}

function applyDeletes(rows: BankRow[], sql: string) {
  const blocks = sql.split(/delete from public\.question_bank/i).slice(1);
  for (const block of blocks) {
    const category = readSqlString(block, block.indexOf("category"))?.value;
    const prompt = readSqlString(block, block.indexOf("prompt"))?.value;
    const at = rows.findIndex(
      (row) => row.category === category && row.prompt === prompt,
    );
    expect(at, prompt).toBeGreaterThanOrEqual(0);
    rows.splice(at, 1);
  }
  return blocks.length;
}

function applyLeakFixes(rows: BankRow[], sql: string) {
  const updates = sql.split(/delete from public\.question_bank/i)[0];
  const blocks = updates.split(/update public\.question_bank/i).slice(1);
  expect(blocks.length).toBeGreaterThan(0);
  for (const block of blocks) {
    const whereAt = block.search(/\nwhere\b/i);
    expect(whereAt).toBeGreaterThan(0);
    const setPart = block.slice(0, whereAt);
    const wherePart = block.slice(whereAt);
    const category = readSqlString(
      wherePart,
      wherePart.indexOf("category"),
    )?.value;
    const oldPrompt = readSqlString(
      wherePart,
      wherePart.toLowerCase().indexOf("prompt"),
    )?.value;
    expect(category).toBeTruthy();
    expect(oldPrompt).toBeTruthy();
    const matches = rows.filter(
      (row) => row.category === category && row.prompt === oldPrompt,
    );
    expect(matches, oldPrompt).toHaveLength(1);
    const row = matches[0];
    if (/\bprompt\s*=/.test(setPart)) {
      const next = readSqlString(
        setPart,
        setPart.toLowerCase().indexOf("prompt"),
      );
      expect(next?.value).toBeTruthy();
      row.prompt = next?.value ?? row.prompt;
    }
    if (/variants\s*=/.test(setPart)) {
      const variantsAt = setPart.toLowerCase().indexOf("variants");
      if (setPart.slice(variantsAt).includes("'{}'")) row.variants = [];
      else {
        const arrayAt = setPart.indexOf("array[", variantsAt);
        const end = setPart.indexOf("]", arrayAt);
        const inner = setPart.slice(arrayAt + "array[".length, end);
        const variants: string[] = [];
        let cursor = 0;
        while (cursor < inner.length) {
          if (inner[cursor] !== "'") {
            cursor += 1;
            continue;
          }
          const parsed = readSqlString(inner, cursor);
          if (!parsed) break;
          variants.push(parsed.value);
          cursor = parsed.end;
        }
        row.variants = variants;
      }
    }
  }
  return blocks.length;
}

describe("promptContainsAnswer", () => {
  it("ловит имя, вписанное в вопрос", () => {
    expect(
      promptContainsAnswer(
        "Кто ведёт мистические расследования и квесты под именем Дмитрий Масленников?",
        "Дмитрий Масленников",
      ),
    ).toBe(true);
    expect(
      promptContainsAnswer(
        "Кто ведёт мистические расследования и квесты под именем Дмитрий Масленников?",
        "Масленников",
      ),
    ).toBe(true);
  });

  it("не считает подсказку без эталона утечкой", () => {
    expect(
      promptContainsAnswer("Кто исполняет хит Blinding Lights?", "The Weeknd"),
    ).toBe(false);
  });
});

describe("банк после правки утечек", () => {
  const rows = [
    ...parseBankInserts(
      readFileSync(
        "supabase/migrations/20261028200100_question_bank.sql",
        "utf8",
      ),
    ),
    ...parseBankInserts(
      readFileSync(
        "supabase/migrations/20261028210100_media_questions.sql",
        "utf8",
      ),
    ),
  ];
  const fixes = readFileSync(
    "supabase/migrations/20261028230100_bank_answer_leaks.sql",
    "utf8",
  );
  applyLeakFixes(rows, fixes);
  const second = readFileSync(
    "supabase/migrations/20261029200000_bank_answer_leaks_2.sql",
    "utf8",
  );
  applyLeakFixes(rows, second);
  const removed = applyDeletes(rows, second);

  it("применяет вторую волну правок целиком", () => {
    expect(removed).toBe(8);
    expect(rows).toHaveLength(172);
  });

  it("не оставляет ответа целиком (с транслитом) ни в вопросе, ни в теме", () => {
    const leaks = rows.flatMap((row) =>
      [row.prompt, row.category]
        .filter((text) => hasBlockingLeak(text, row.answer, row.variants))
        .map((text) => `${row.category}: ${text} → ${row.answer}`),
    );
    expect(leaks).toEqual([]);
  });

  it("в медиавопросах не называет звучащий трек", () => {
    const named = rows.filter(
      (row) =>
        /клип|трек|песн|хит/i.test(row.prompt) &&
        /[A-Z][a-z]+ [A-Z]?[a-z]+\?$|\b(Thunder|Perfect|Hello|Roar|Faded|Despacito|Shape of You|Uptown Funk|Gangnam Style|Blank Space|Shake It Off|Blinding Lights)\b/.test(
          row.prompt,
        ) &&
        /^(Кто|Чей|Чья|Какая группа)/.test(row.prompt) &&
        row.category !== "Артисты",
    );
    expect(named.map((row) => row.prompt)).toEqual([]);
  });

  it("не принимает вариант, который уже стоит в тексте вопроса", () => {
    const twitter = rows.find((row) => row.answer === "Twitter");
    expect(twitter?.variants).not.toContain("X");
  });

  it("не оставляет в вопросе эталон или допустимый вариант", () => {
    const leaks = rows.flatMap((row) => {
      const hits = [row.answer, ...row.variants].filter((needle) =>
        promptContainsAnswer(row.prompt, needle),
      );
      return hits.length
        ? [`${row.category}: ${row.prompt} → ${hits.join(", ")}`]
        : [];
    });
    expect(leaks).toEqual([]);
  });
});

describe("findAnswerLeaks", () => {
  it("ловит ответ латиницей в кириллическом вопросе и наоборот", () => {
    expect(
      hasBlockingLeak(
        "Кто ведёт игровой канал Kuplinov Play?",
        "Дмитрий Куплинов",
        ["Куплинов"],
      ),
    ).toBe(true);
    expect(hasBlockingLeak("Какой сервис называют Шазамом?", "Shazam")).toBe(
      true,
    );
    expect(hasBlockingLeak("Чем знаменит проект Rozetked?", "Розеткед")).toBe(
      true,
    );
  });

  it("ловит регистр, ё/е и пунктуацию", () => {
    expect(
      hasBlockingLeak("Что такое «ВСЁ ХОРОШО» на меме?", "This is fine", [
        "Всё хорошо",
      ]),
    ).toBe(true);
    expect(hasBlockingLeak("кто такой губка-боб?", "Губка Боб")).toBe(true);
  });

  it("ловит короткий вариант-алиас целым словом", () => {
    expect(
      hasBlockingLeak(
        "Как называется соцсеть с птичкой, которую переименовали в X?",
        "Twitter",
        ["Твиттер", "X"],
      ),
    ).toBe(true);
    expect(
      hasBlockingLeak("Какая соцсеть с логотипом «вк»?", "ВКонтакте", ["ВК"]),
    ).toBe(true);
  });

  it("ловит слитное написание", () => {
    expect(hasBlockingLeak("Кто такой thebrianmaps?", "TheBrianMaps")).toBe(
      true,
    );
  });

  it("отмечает часть имени исполнителя или названия как подсказку", () => {
    const leaks = findAnswerLeaks(
      "Как зовут певицу, фанатов которой называют свифти?",
      "Тейлор Свифт",
      ["Taylor Swift"],
    );
    expect(leaks.some((leak) => leak.level === "part")).toBe(true);
    expect(
      findAnswerLeaks(
        "Как называется музыкальный сервис Apple?",
        "Apple Music",
      ),
    ).toEqual([{ needle: "apple", level: "part", via: "same" }]);
  });

  it("не путает обычные слова и не ругается на честные вопросы", () => {
    expect(
      findAnswerLeaks("Кто исполняет хит Blinding Lights?", "The Weeknd", [
        "Уикенд",
      ]),
    ).toEqual([]);
    expect(
      findAnswerLeaks("Какая компания выпускает iPhone?", "Apple", ["Эпл"]),
    ).toEqual([]);
    expect(
      findAnswerLeaks(
        "В какой игре строят из блоков и сражаются с криперами?",
        "Minecraft",
        ["Майнкрафт"],
      ),
    ).toEqual([]);
  });

  it("звуковой скелет сводит латиницу и кириллицу", () => {
    expect(soundSkeleton("Джастин")).toBe(soundSkeleton("Justin"));
    expect(soundSkeleton("Шазам")).toBe(soundSkeleton("Shazam"));
    expect(soundSkeleton("Тикток")).toBe(soundSkeleton("TikTok"));
  });
});
