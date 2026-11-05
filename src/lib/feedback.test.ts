import { describe, expect, it } from "vitest";
import { feedbackMessage, parseFeedback } from "./feedback";

describe("feedback", () => {
  it("требует текст и режет до 2000", () => {
    expect(parseFeedback({ text: " " }).ok).toBe(false);
    expect(parseFeedback({ text: "a".repeat(2001) }).ok).toBe(false);
  });
  it("собирает сообщение", () => {
    const p = parseFeedback({
      text: "сломалось",
      room: "akyf",
      role: "host",
      errors: [1, 2, 3, 4, 5, 6].map(String),
    });
    if (!p.ok) throw new Error();
    expect(p.value.errors).toHaveLength(5);
    const m = feedbackMessage(p.value, {
      username: "@x",
      userAgent: "UA",
      now: new Date("2026-11-04T21:00:00Z"),
    });
    expect(m.startsWith("🐞 Баг")).toBe(true);
    expect(m).toContain("Комната: AKYF");
    expect(m).toContain("Роль: ведущий");
    expect(m).toContain("05.11.2026, 00:00:00");
  });
});
