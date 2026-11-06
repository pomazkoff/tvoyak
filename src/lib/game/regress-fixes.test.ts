import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findAnswerLeaks } from "@/lib/game/bank-leaks";

type Update = Record<string, string | string[] | number | boolean | null>;

/** Разбирает `update public.question_bank set a = …, b = … where …;`. */
function parseUpdates(sql: string): Update[] {
  const updates: Update[] = [];
  for (const block of sql
    .split(/update public\.question_bank set /i)
    .slice(1)) {
    const row: Update = {};
    let index = 0;
    const readString = () => {
      let value = "";
      index += 1;
      while (index < block.length) {
        if (block[index] === "'" && block[index + 1] === "'") {
          value += "'";
          index += 2;
        } else if (block[index] === "'") {
          index += 1;
          return value;
        } else value += block[index++];
      }
      return value;
    };
    while (index < block.length) {
      const key = /^\s*,?\s*([a-z_]+) = /.exec(block.slice(index));
      if (!key) break;
      index += key[0].length;
      if (block.startsWith("array[", index)) {
        index += "array[".length;
        const items: string[] = [];
        while (block[index] !== "]") {
          if (block[index] === "'") items.push(readString());
          else index += 1;
        }
        index = block.indexOf("::text[]", index) + "::text[]".length;
        row[key[1]] = items;
      } else if (block.startsWith("'{}'::text[]", index)) {
        index += "'{}'::text[]".length;
        row[key[1]] = [];
      } else if (block[index] === "'") {
        row[key[1]] = readString();
        if (block.startsWith("::jsonb", index)) index += "::jsonb".length;
      } else {
        const token = /^[^,\s]+/.exec(block.slice(index))![0];
        index += token.length;
        row[key[1]] =
          token === "null"
            ? null
            : token === "true" || token === "false"
              ? token === "true"
              : Number(token);
      }
      if (/^\s*where /.test(block.slice(index))) break;
    }
    const where = /where id = '([^']+)' and category = '((?:[^']|'')+)'/.exec(
      block,
    );
    row.id = where?.[1] ?? null;
    row.category = where?.[2].replace(/''/g, "'") ?? null;
    updates.push(row);
  }
  return updates;
}

const sql = readFileSync(
  "supabase/migrations/20261030110000_regress_fixes.sql",
  "utf8",
);
const updates = parseUpdates(sql);

describe("правки по регрессу новых категорий", () => {
  it("разбирает все правки и привязывает их к id", () => {
    expect(updates.length).toBe(94);
    expect(updates.every((row) => row.id && row.category)).toBe(true);
    expect(updates.filter((row) => typeof row.answer === "string").length).toBe(
      15,
    );
  });

  it("убирает служебную нумерацию и не плодит одинаковых вопросов", () => {
    const seen = new Set<string>();
    for (const row of updates) {
      if (typeof row.prompt !== "string") continue;
      expect(row.prompt).not.toMatch(/№\s*\d/);
      const key = `${row.category}\u0000${row.prompt}`;
      expect(seen.has(key), row.prompt).toBe(false);
      seen.add(key);
    }
  });

  it("новые вопросы не выдают ответ", () => {
    for (const row of updates) {
      if (typeof row.answer !== "string") continue;
      const leaks = findAnswerLeaks(
        `${row.category} ${row.prompt}`,
        row.answer,
        (row.variants as string[]) ?? [],
      );
      expect(leaks, `${row.answer}: ${row.prompt}`).toEqual([]);
    }
  });

  it("звук наоборот — только задом наперёд", () => {
    const sound = updates.filter((row) => row.category === "Звук наоборот");
    expect(sound.length).toBe(21);
    expect(sound.every((row) => row.audio_fx === "reverse")).toBe(true);
  });

  it("окна роликов короткие и корректные", () => {
    for (const row of updates) {
      if (typeof row.end_seconds !== "number") continue;
      const start = Number(row.start_seconds ?? 0);
      expect(row.end_seconds).toBeGreaterThan(start);
      if (row.category === "Голос из прошлого")
        expect(row.end_seconds - start).toBeLessThanOrEqual(25);
    }
  });
});
