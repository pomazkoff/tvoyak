import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const file = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../supabase/migrations/20261128140000_analytics_utm.sql",
);

describe("миграция utm", () => {
  const sql = readFileSync(file, "utf8");

  it("добавляет jsonb-колонку комнатам и платежам", () => {
    expect(sql.toLowerCase()).toContain("alter table public.rooms");
    expect(sql.toLowerCase()).toContain("alter table public.host_payments");
    expect(
      sql.toLowerCase().match(/add column if not exists utm jsonb/g),
    ).toHaveLength(2);
  });

  it("не кладёт CASE в условие IF без скобок", () => {
    const code = sql.replace(/--[^\n]*/g, "").replace(/'[^']*'/g, "''");
    expect(code).not.toMatch(/\bif\s+case\b/i);
    expect(code).not.toMatch(/\bcase\b/i);
  });
});
