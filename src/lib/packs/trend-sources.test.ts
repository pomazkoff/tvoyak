import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectTrendSources,
  isOffLimits,
  parseAppleRss,
  parseDeezer,
  parsePipedTrending,
  parseRssTitles,
  parseYandexChart,
  runSource,
  SOURCES,
  topicsFrom,
} from "@/lib/packs/trend-sources";

const fixture = (name: string) =>
  readFileSync(path.join(__dirname, "__fixtures__", name), "utf8");

describe("trend parsers", () => {
  it("reads Deezer chart tracks", () => {
    const items = parseDeezer(fixture("deezer-chart.json"));
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      source: "deezer",
      artist: "Tame Impala",
      externalId: "3818963601",
    });
  });

  it("reads Apple Music RU top songs", () => {
    const items = parseAppleRss(fixture("apple-rss.json"));
    expect(items.map((item) => item.title)).toEqual([
      "Украсть тебя",
      "ДИНАСТИЯ",
      "Шадэ",
    ]);
    expect(items[0]?.externalId).toBe("6820477982");
  });

  it("reads Piped trending with video ids", () => {
    const items = parsePipedTrending(fixture("piped-trending.json"));
    expect(items).toHaveLength(3);
    expect(items[0]?.externalId).toBe("UDJ5ejaLAC0");
  });

  it("reads Yandex Music chart shape", () => {
    const items = parseYandexChart(fixture("yandex-chart.json"));
    expect(items[0]).toMatchObject({
      title: "Трек один",
      artist: "Артист А, Артист Б",
    });
  });

  it("reads RSS item titles and drops deaths and illness", () => {
    const titles = parseRssTitles(fixture("lenta-rss.xml")).map(
      (item) => item.title,
    );
    expect(titles).toContain(
      "Ярушин начал просить деньги за выступление в образе из клипа Zombie",
    );
    expect(titles.some((title) => title.includes("умерла"))).toBe(false);
    expect(titles.some((title) => title.includes("больной"))).toBe(false);
    expect(titles.some((title) => title.startsWith("Lenta.ru"))).toBe(false);
  });

  it("garbage input gives empty lists, not throws", () => {
    expect(parseDeezer("<html>")).toEqual([]);
    expect(parseAppleRss("{}")).toEqual([]);
    expect(parsePipedTrending("null")).toEqual([]);
    expect(parseYandexChart('{"error":{"name":"Unavailable"}}')).toEqual([]);
    expect(parseRssTitles("nope")).toEqual([]);
  });
});

describe("politics filter", () => {
  it("blocks politics, war and crime", () => {
    for (const title of [
      "Путин провёл встречу",
      "Госдума приняла закон",
      "Новые санкции против",
      "Суд арестовал блогера",
      "Удар беспилотника",
      "ВСУ атаковали",
      "НАТО заявило",
    ])
      expect(isOffLimits(title), title).toBe(true);
  });

  it("keeps harmless headlines with tricky substrings", () => {
    for (const title of [
      "«Своя игра» вернулась в эфир",
      "Судья не засчитал гол",
      "Выставка Айвазовского в Москве",
      "Теннисистка сменила ракетку",
    ])
      expect(isOffLimits(title), title).toBe(false);
  });
});

describe("sources are fail-soft", () => {
  it("one dead source does not break the others", async () => {
    const fake = async (url: string) => {
      if (url.includes("deezer"))
        return {
          ok: true,
          status: 200,
          text: async () => fixture("deezer-chart.json"),
        };
      if (url.includes("apple"))
        return {
          ok: true,
          status: 200,
          text: async () => fixture("apple-rss.json"),
        };
      if (url.includes("yandex"))
        return { ok: false, status: 451, text: async () => "" };
      if (url.includes("lenta"))
        return {
          ok: true,
          status: 200,
          text: async () => fixture("lenta-rss.xml"),
        };
      throw new Error("The operation was aborted due to timeout");
    };
    const results = await collectTrendSources(fake, 50);
    const by = Object.fromEntries(
      results.map((result) => [result.source, result]),
    );
    expect(by.deezer?.items).toHaveLength(3);
    expect(by.apple?.items).toHaveLength(3);
    expect(by.yandex?.items).toHaveLength(0);
    expect(by.yandex?.note).toContain("451");
    expect(by.youtube?.note).toContain("таймаут");
    expect(by.vk?.note).toContain("VK");
    expect(by.news?.items.length).toBeGreaterThan(0);
    const topics = topicsFrom(results);
    expect(topics).toContain("МАЯК X — Украсть тебя");
    expect(new Set(topics).size).toBe(topics.length);
  });

  it("youtube falls through to the next mirror", async () => {
    const spec = SOURCES.find((source) => source.source === "youtube")!;
    const calls: string[] = [];
    const result = await runSource(spec, async (url) => {
      calls.push(url);
      if (calls.length === 1)
        return { ok: false, status: 526, text: async () => "" };
      return {
        ok: true,
        status: 200,
        text: async () => fixture("piped-trending.json"),
      };
    });
    expect(calls).toHaveLength(2);
    expect(result.items).toHaveLength(3);
  });
});
