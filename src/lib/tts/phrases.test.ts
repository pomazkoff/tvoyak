import { describe, expect, it } from "vitest";
import { verdictLine } from "@/lib/game/verdict-speech";
import {
  RateLimiter,
  isAllowedPhrase,
  parseVerdictPhrase,
  parseYandexAudio,
  ttsCacheKey,
} from "@/lib/tts/phrases";

const b64 = (s: string) => Buffer.from(s).toString("base64");

describe("parseYandexAudio", () => {
  it("склеивает куски из нескольких JSON-строк", () => {
    const body = [
      JSON.stringify({ result: { audioChunk: { data: b64("ID3") } } }),
      "",
      JSON.stringify({ result: { audioChunk: { data: b64("-tail") } } }),
    ].join("\n");
    expect(parseYandexAudio(body).toString()).toBe("ID3-tail");
  });
  it("падает на пустом ответе и на ошибке", () => {
    expect(() => parseYandexAudio("")).toThrow();
    expect(() => parseYandexAudio('{"error":{"message":"x"}}')).toThrow();
  });
});

describe("ttsCacheKey", () => {
  it("зависит от голоса, роли и текста, но не от пробелов", () => {
    expect(ttsCacheKey("Привет,  мир")).toBe(ttsCacheKey(" Привет, мир "));
    expect(ttsCacheKey("Привет")).not.toBe(ttsCacheKey("Привет", "alena"));
    expect(ttsCacheKey("Привет")).not.toBe(
      ttsCacheKey("Привет", "marina", "whisper"),
    );
    expect(ttsCacheKey("Привет")).toMatch(
      /^marina-friendly\/[0-9a-f]{64}\.mp3$/,
    );
  });
});

describe("isAllowedPhrase", () => {
  const allowed = {
    prompts: ["Столица Франции?"],
    answers: ["Париж"],
  };
  it("пускает вопросы комнаты", () => {
    expect(isAllowedPhrase("Столица  Франции?", allowed)).toBe(true);
    expect(isAllowedPhrase("Скажи что-нибудь смешное", allowed)).toBe(false);
  });
  it("пускает все вердикты verdictLine с вскрытым ответом", () => {
    for (const head of ["Верно!", "Неверно.", ""]) {
      const line = [head, "Правильный ответ: Париж."].filter(Boolean).join(" ");
      expect(isAllowedPhrase(line, allowed)).toBe(true);
    }
    expect(isAllowedPhrase("Верно!", allowed)).toBe(true);
    expect(isAllowedPhrase("Неверно.", allowed)).toBe(true);
    const line = verdictLine({
      from: "answering",
      to: "reveal",
      before: { a: 0 },
      after: { a: 100 },
      answer: "Париж",
    });
    expect(line && isAllowedPhrase(line, allowed)).toBe(true);
  });
  it("не служит оракулом для невскрытых ответов", () => {
    expect(isAllowedPhrase("Правильный ответ: Лондон.", allowed)).toBe(false);
    expect(isAllowedPhrase("Верно! Купи слона.", allowed)).toBe(false);
    expect(isAllowedPhrase("", allowed)).toBe(false);
    expect(
      isAllowedPhrase("x".repeat(501), {
        prompts: ["x".repeat(501)],
        answers: [],
      }),
    ).toBe(false);
  });
  it("parseVerdictPhrase", () => {
    expect(parseVerdictPhrase("Верно! Правильный ответ: А. Б.")).toEqual({
      head: "Верно!",
      answer: "А. Б",
    });
    expect(parseVerdictPhrase("Привет")).toBeNull();
  });
});

describe("RateLimiter", () => {
  it("режет сверх лимита в окне", () => {
    const rl = new RateLimiter(2, 1000);
    expect(rl.take("r", 0)).toBe(true);
    expect(rl.take("r", 10)).toBe(true);
    expect(rl.take("r", 20)).toBe(false);
    expect(rl.take("r", 1500)).toBe(true);
  });
});
