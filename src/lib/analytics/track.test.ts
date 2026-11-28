import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YM_EVENTS, metrikaCounterId, trackGoal } from "./goals";
import { goalParams } from "./params";
import {
  YM_DEFAULT_ID,
  bootYandexMetrika,
  listenForGoalEvents,
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

function installBrowser(hostname = "localhost") {
  const store = new Map<string, string>();
  const calls: unknown[][] = [];
  const scripts: { id: string; text: string }[] = [];
  const listeners = new Set<(event: Event) => void>();
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
    location: { hostname, href: `https://${hostname}/`, protocol: "https:" },
    ym: (...args: unknown[]) => {
      calls.push(args);
    },
    addEventListener(_type: string, fn: (event: Event) => void) {
      listeners.add(fn);
    },
    dispatchEvent(event: Event) {
      for (const fn of listeners) fn(event);
      return true;
    },
  });
  vi.stubGlobal("document", {
    cookie: "",
    title: "Твояк",
    head: {
      appendChild(node: { id: string; text: string }) {
        scripts.push(node);
      },
    },
    getElementById: () => null,
    createElement: () => ({ id: "", text: "" }),
    documentElement: {},
  });
  return { calls, store, scripts };
}

/** Продакшен-сборка, открытая на боевом домене. */
function asProduction(hostname = "tvoyak.ru") {
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
  return installBrowser(hostname);
}

describe("счётчик", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    resetAnalyticsMemory();
  });

  it("на проде tvoyak.ru без переменной берёт 114751032", () => {
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "  ");
    asProduction("tvoyak.ru");
    expect(ymCounterId()).toBe(Number(YM_DEFAULT_ID));
    asProduction("www.tvoyak.ru");
    expect(ymCounterId()).toBe(114751032);
  });

  it("localhost, превью и vercel.app дефолтный счётчик не включают", () => {
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    installBrowser("localhost");
    expect(ymCounterId()).toBeNull();
    installBrowser("127.0.0.1");
    expect(ymCounterId()).toBeNull();
    installBrowser("tvoyak.vercel.app");
    expect(ymCounterId()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "preview");
    installBrowser("tvoyak.ru");
    expect(ymCounterId()).toBeNull();
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
    installBrowser("tvoyak.ru");
    expect(ymCounterId()).toBeNull();
  });

  it("явный id перекрывает дефолт только на проде", () => {
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    asProduction();
    expect(ymCounterId()).toBe(12345678);
    installBrowser("localhost");
    expect(ymCounterId()).toBeNull();
  });

  it("мусор в NEXT_PUBLIC_YM_ID не подменяется дефолтом", () => {
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "abc");
    asProduction();
    expect(ymCounterId()).toBeNull();
  });

  it("id — только цифры", () => {
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    asProduction();
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
    const { calls } = installBrowser("localhost");
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    track(YM_EVENTS.room_created, { role: "host", room_id: ROOM });
    expect(calls).toEqual([]);
  });

  it("прод без переменной шлёт дефолтный счётчик", () => {
    const { calls } = asProduction();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    track(YM_EVENTS.click_create_room, { role: "host" });
    expect(calls[0]?.[0]).toBe(114751032);
    expect(calls[0]?.[2]).toBe("click_create_room");
  });

  it("reachGoal с параметрами и UTM, без личных полей", () => {
    const { calls } = asProduction();
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
    const { calls } = asProduction();
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
    const { calls } = asProduction();
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
    const { calls } = installBrowser("localhost");
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "production");
    ymHit("https://tvoyak.ru/tv", "Табло");
    expect(calls).toEqual([]);
    const prod = asProduction();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
    ymHit("https://tvoyak.ru/tv", "Табло");
    expect(prod.calls).toEqual([
      [12345678, "hit", "https://tvoyak.ru/tv", { title: "Табло" }],
    ]);
  });

  it("final_qr_click и share_click уходят один раз, с UTM и дефолтным номером", () => {
    const { calls } = asProduction();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    const queued: unknown[][] = [];
    const ym = Object.assign(
      (...args: unknown[]) => {
        calls.push(args);
        queued.push(args);
      },
      { a: queued },
    );
    (window as unknown as { ym: typeof ym }).ym = ym;
    ym(Number(YM_DEFAULT_ID), "init", {});
    expect(metrikaCounterId(window)).toBe(114751032);

    rememberUtmTouch("?utm_source=ya&utm_medium=cpc");
    listenForGoalEvents();
    trackGoal("share_click", { format: "stories" });
    trackGoal("final_qr_click");
    trackGoal("share_click", { format: "square" });

    const reaches = calls.filter((call) => call[1] === "reachGoal");
    expect(reaches).toHaveLength(3);
    expect(reaches.map((call) => call[2])).toEqual([
      "share_click",
      "final_qr_click",
      "share_click",
    ]);
    expect(reaches.every((call) => call[0] === 114751032)).toBe(true);
    expect(reaches[0]?.[3]).toMatchObject({
      format: "stories",
      utm_source: "ya",
      utm_medium: "cpc",
      utm_first_source: "ya",
      utm_first_medium: "cpc",
    });
    expect(reaches[1]?.[3]).toMatchObject({
      utm_source: "ya",
      utm_first_source: "ya",
    });
    expect(reaches[1]?.[3]).not.toHaveProperty("format");
    expect(reaches[2]?.[3]).toMatchObject({
      format: "square",
      utm_source: "ya",
    });
  });

  it("скрипт счётчика ставится один раз", () => {
    const { scripts } = asProduction();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "");
    const id = ymCounterId();
    expect(id).toBe(114751032);
    bootYandexMetrika(id!);
    bootYandexMetrika(id!);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]?.text).toContain('ym(114751032,"init"');
    expect(scripts[0]?.id).toBe("yandex-metrika");
  });

  it("готовые цели QR и шаринга зовут reachGoal", () => {
    const { calls } = asProduction();
    vi.stubEnv("NEXT_PUBLIC_YM_ID", "12345678");
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
