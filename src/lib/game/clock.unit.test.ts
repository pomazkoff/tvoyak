import { describe, expect, it } from "vitest";
import {
  BOT_READ_LIMIT_MS,
  CLOCK_GRACE_MS,
  clockDueAt,
  clockKey,
  clockRetryDelay,
} from "@/lib/game/clock";

describe("клиентские часы", () => {
  it("без срока не зовут сервер", () => {
    expect(clockDueAt({ phase: "board", version: 3, deadline: null })).toBe(
      null,
    );
  });

  it("зовут сервер чуть позже края срока", () => {
    const deadline = "2026-10-29T10:00:00.000Z";
    expect(clockDueAt({ phase: "answering", version: 4, deadline })).toBe(
      new Date(deadline).getTime() + CLOCK_GRACE_MS,
    );
  });

  it("у бота открывают кнопку, если чтение вопроса затянулось", () => {
    const updated = "2026-10-29T10:00:00.000Z";
    const game = {
      phase: "question",
      version: 7,
      deadline: null,
      updated_at: updated,
    };
    expect(clockDueAt(game, "human")).toBe(null);
    expect(clockDueAt(game, "bot")).toBe(
      new Date(updated).getTime() + BOT_READ_LIMIT_MS + CLOCK_GRACE_MS,
    );
  });

  it("повторяют вызов с растущей паузой, но не реже раза в 5 секунд", () => {
    expect(clockRetryDelay(0)).toBe(800);
    expect(clockRetryDelay(1)).toBe(1600);
    expect(clockRetryDelay(2)).toBe(3200);
    expect(clockRetryDelay(10)).toBe(5000);
  });

  it("ключ меняется вместе с версией партии", () => {
    const game = { phase: "answering", version: 4, deadline: null };
    expect(clockKey(game)).not.toBe(clockKey({ ...game, version: 5 }));
  });
});
