import { describe, expect, it } from "vitest";
import { lateAnswerMessage, messageFor } from "@/lib/rooms/messages";

describe("сообщения об ошибках", () => {
  it("«Кто-то нажал раньше» — только для проигранной гонки", () => {
    expect(messageFor("lost_race")).toBe("Кто-то нажал раньше.");
    for (const code of [
      "too_late",
      "answer_late",
      "buzz_closed",
      "bad_phase",
      "not_your_turn",
      "already_buzzed",
      "no_active_question",
    ]) {
      expect(messageFor(code)).not.toBe("Кто-то нажал раньше.");
    }
  });

  it("просроченный ответ называет штраф", () => {
    expect(lateAnswerMessage(400)).toBe("Время вышло — −400");
    expect(lateAnswerMessage(-400)).toBe("Время вышло — −400");
    expect(lateAnswerMessage(0)).toBe("Время вышло");
  });

  it("сбой RPC не называют созданием комнаты", () => {
    expect(messageFor("rpc_failed")).not.toMatch(/создать комнату/);
    expect(messageFor("buzz_closed")).toMatch(/кнопк/i);
  });
});
