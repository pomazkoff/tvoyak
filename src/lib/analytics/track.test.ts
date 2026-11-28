import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YM_EVENTS, YM_PENDING_EVENTS } from "./goals";
import { goalParams } from "./params";
import {
  resetAnalyticsMemory,
  tariffRub,
  track,
  trackFinalQrClick,
  trackGameFinished,
  trackGameStarted,
  trackOnce,
  trackShareClick,
  ymCounterId,
  ymHit,
  ymInitSnippet,
} from "./track";
import { rememberUtmTouch, resetUtmFallback } from "./utm";

const ROOM = "11111111-1111-4111-8111-111111111111";

function installBrowser() {
  const store = new Map<string, string>();
  const calls: unknown[][] = [];
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  });
  vi.stubGlobal("window", {
    ym: (...args: unknown[]) => {
      calls.push(args);
    },
  });
  vi.stubGlobal("document", { cookie: "", title: "Твояк" });
  return { calls, store };
}

describe("счётчик", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("без NEXT_PUBLIC_YM_ID счётчика нет", () => {
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "  ");
    expect(ymCounterId()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "abc");
    expect(ymCounterId()).toBeNull();
  });

  it("id — только цифры", () => {
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    expect(ymCounterId()).toBe(12345678);
  });

  it("сниппет грузит tag.js и включает карту кликов и вебвизор", () => {
    const snippet = ymInitSnippet(12345678);
    expect(snippet).toContain("https://mc.yandex.ru/metrika/tag.js");
    expect(snippet).toContain("clickmap:true");
    expect(snippet).toContain("webvisor:true");
    expect(snippet).toContain('ym(12345678,"init"');
    expect(ymInitSnippet(Number.NaN)).toBe("");
    expect(ymInitSnippet(12)).toBe("");
  });
});

describe("track", () => {
  beforeEach(() => {
    resetAnalyticsMemory();
    resetUtmFallback();
  });

  afterEach(() => {
    resetAnalyticsMemory();
    resetUtmFallback();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("без счётчика молчит", () => {
    const { calls } = installBrowser();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    track(YM_EVENTS.room_created, { role: "host", room_id: ROOM });
    expect(calls).toEqual([]);
  });

  it("reachGoal с параметрами и UTM, без личных полей", () => {
    const { calls } = installBrowser();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    rememberUtmTouch("?utm_source=ya&utm_medium=cpc&utm_campaign=spring");
    track(YM_EVENTS.room_created, {
      role: "host",
      host_type: "bot",
      play_mode: "together",
      room_id: ROOM,
      count: 4,
    });
    expect(calls).toEqual([
      [
        12345678,
        "reachGoal",
        "room_created",
        {
          role: "host",
          host_type: "bot",
          play_mode: "together",
          room_id: ROOM,
          count: 4,
          utm_first_source: "ya",
          utm_first_medium: "cpc",
          utm_first_campaign: "spring",
          utm_source: "ya",
          utm_medium: "cpc",
          utm_campaign: "spring",
        },
      ],
    ]);
  });

  it("не шлёт имя, почту и кривой room_id", () => {
    expect(
      goalParams(
        {
          role: "player",
          room_id: "not-a-uuid",
          nickname: "Анна",
          email: "a@b.c",
          phone: "+79990000000",
          count: 1.5,
          tariff: 10,
          format: "poster",
        },
        {},
      ),
    ).toEqual({ role: "player" });
  });

  it("trackOnce не повторяет событие", () => {
    const { calls } = installBrowser();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    trackOnce(YM_EVENTS.payment_success, "pay-1", {
      role: "host",
      tariff: 99,
    });
    trackOnce(YM_EVENTS.payment_success, "pay-1", {
      role: "host",
      tariff: 99,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[2]).toBe("payment_success");
  });

  it("финиш уходит один раз и только с браузера, который начал партию", () => {
    const { calls } = installBrowser();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    const params = {
      role: "host" as const,
      room_id: ROOM,
      count: 3,
      host_type: "human" as const,
    };
    trackGameFinished(params);
    expect(calls).toEqual([]);
    trackGameStarted(params);
    trackGameFinished(params);
    trackGameFinished(params);
    expect(calls.map((call) => call[2])).toEqual([
      "game_started",
      "game_finished",
    ]);
  });

  it("hit для SPA не уходит без счётчика", () => {
    const { calls } = installBrowser();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    ymHit("https://tvoyak.ru/tv", "Табло");
    expect(calls).toEqual([]);
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    ymHit("https://tvoyak.ru/tv", "Табло");
    expect(calls).toEqual([
      [12345678, "hit", "https://tvoyak.ru/tv", { title: "Табло" }],
    ]);
  });

  it("готовые цели QR и шаринга зовут reachGoal", () => {
    const { calls } = installBrowser();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    expect(YM_PENDING_EVENTS.final_qr_click).toBe("final_qr_click");
    expect(YM_PENDING_EVENTS.share_click).toBe("share_click");
    trackFinalQrClick({ role: "host", room_id: ROOM });
    trackShareClick("stories", { role: "host", room_id: ROOM });
    expect(calls.map((call) => call[2])).toEqual([
      "final_qr_click",
      "share_click",
    ]);
    expect(calls[1]?.[3]).toMatchObject({ format: "stories" });
  });

  it("тариф — 99 или 499", () => {
    expect(tariffRub("game")).toBe(99);
    expect(tariffRub("month")).toBe(499);
    expect(tariffRub("year")).toBeUndefined();
    expect(tariffRub(null)).toBeUndefined();
  });
});
