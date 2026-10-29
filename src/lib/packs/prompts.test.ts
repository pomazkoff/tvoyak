import { describe, expect, it } from "vitest";
import {
  GENERATION_SYSTEM,
  generationUser,
  reviewSystem,
} from "@/lib/packs/prompts";
import { NO_LEAK_RULE } from "@/lib/packs/review";

describe("промпты пачек", () => {
  it("генерация знает правило «без утечки ответа»", () => {
    expect(GENERATION_SYSTEM).toContain(NO_LEAK_RULE);
    expect(generationUser(["кино"])).toMatch(/НЕ варианты для выбора/);
  });

  it("каждый LLM-проход проверяет утечку", () => {
    for (const pass of ["fact", "freshness", "difficulty"] as const) {
      expect(reviewSystem(pass)).toContain(NO_LEAK_RULE);
      expect(reviewSystem(pass)).toMatch(/утечка/);
    }
  });
});

describe("leak review wording", () => {
  it("tells reviewers that answer/variants are the reference, not a leak", () => {
    for (const pass of ["fact", "freshness", "difficulty"] as const) {
      expect(reviewSystem(pass)).toMatch(/answer и variants — это эталон/);
      expect(reviewSystem(pass)).toMatch(/media_note/);
    }
  });
});
