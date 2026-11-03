import { describe, expect, it } from "vitest";
import {
  MEDIA_HOLD_MAX_MS,
  MEDIA_HOLD_SLACK_MS,
  REMOTE_FALLBACK_MS,
  questionReadMs,
  remoteFallbackStart,
  roomVoiceOn,
  shouldHoldMedia,
} from "@/lib/game/media-hold";

const track = {
  id: "q1",
  kind: "music",
  audio_url: "https://audio-ssl.itunes.apple.com/x.m4a",
};
const base = {
  voiceOn: true,
  autoplay: true,
  phase: "question",
  cell: track,
  prompt: "Угадайте песню, сыгранную задом наперёд",
  releasedId: null,
};

describe("медиа ждёт, пока ведущий дочитает вопрос", () => {
  it("держит трек, пока голос читает вопрос", () => {
    expect(shouldHoldMedia(base)).toBe(true);
  });

  it("отпускает, когда голос дочитал этот вопрос", () => {
    expect(shouldHoldMedia({ ...base, releasedId: "q1" })).toBe(false);
  });

  it("отпуск прошлого вопроса не действует на новый", () => {
    expect(shouldHoldMedia({ ...base, releasedId: "q0" })).toBe(true);
  });

  it("кнопка открыта (buzzing) — играем сразу", () => {
    expect(shouldHoldMedia({ ...base, phase: "buzzing" })).toBe(false);
  });

  it("голос выключен — не держим", () => {
    expect(shouldHoldMedia({ ...base, voiceOn: false })).toBe(false);
  });

  it("живой ведущий включает трек сам — не держим", () => {
    expect(shouldHoldMedia({ ...base, autoplay: false })).toBe(false);
  });

  it("вопрос без текста — читать нечего, не держим", () => {
    expect(shouldHoldMedia({ ...base, prompt: "" })).toBe(false);
  });

  it("текстовый вопрос и картинка-задание не держатся", () => {
    expect(shouldHoldMedia({ ...base, cell: { id: "q1", kind: "text" } })).toBe(
      false,
    );
    expect(
      shouldHoldMedia({
        ...base,
        cell: { ...track, picture: "rebus", image_url: "https://x/y.png" },
      }),
    ).toBe(false);
  });

  it("видео со звуком тоже ждёт", () => {
    expect(
      shouldHoldMedia({
        ...base,
        cell: { id: "q1", kind: "video", youtube_id: "abc" },
      }),
    ).toBe(true);
  });
});

describe("сроки", () => {
  it("оценка чтения в пределах 6–30 с", () => {
    expect(questionReadMs("да")).toBe(6000);
    expect(questionReadMs("x".repeat(1000))).toBe(30000);
  });

  it("телефон ждёт дольше, чем экран может держать трек", () => {
    expect(MEDIA_HOLD_MAX_MS).toBe(30000 + MEDIA_HOLD_SLACK_MS);
    expect(REMOTE_FALLBACK_MS).toBeGreaterThan(MEDIA_HOLD_MAX_MS);
    expect(remoteFallbackStart("2026-11-03T17:00:00Z")).toBe(
      Date.parse("2026-11-03T17:00:00Z") + REMOTE_FALLBACK_MS,
    );
    expect(remoteFallbackStart(null)).toBeNull();
  });

  it("голос комнаты: по умолчанию у бота включён", () => {
    expect(roomVoiceOn({ host_mode: "bot" })).toBe(true);
    expect(roomVoiceOn({ host_mode: "human" })).toBe(false);
    expect(roomVoiceOn({ host_mode: "bot", host_voice: false })).toBe(false);
    expect(roomVoiceOn({ host_mode: "human", host_voice: true })).toBe(true);
  });
});
