import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { promptContainsAnswer } from "@/lib/game/bank-leaks";

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

function applyLeakFixes(rows: BankRow[], sql: string) {
  const blocks = sql.split(/update public\.question_bank/i).slice(1);
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
