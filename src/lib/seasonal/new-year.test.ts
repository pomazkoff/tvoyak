import { describe, expect, it } from "vitest";
import {
  moscowDateKey,
  resolveSeasonalTheme,
  seasonalBootScript,
  type SeasonalTheme,
} from "./new-year";

function theme(now: string, query?: string | null, env?: string | null) {
  return resolveSeasonalTheme({
    now: new Date(now),
    query,
    env,
  });
}

function boot(
  now: string,
  search: string,
  env?: string,
): SeasonalTheme | "off" | undefined {
  const dataset: { season?: string } = {};
  const run = new Function(
    "document",
    "location",
    "URLSearchParams",
    "Intl",
    "Date",
    seasonalBootScript(env),
  );
  const RealDate = Date;
  function FrozenDate() {
    return new RealDate(now);
  }
  run(
    { documentElement: { dataset } },
    { search },
    URLSearchParams,
    Intl,
    FrozenDate,
  );
  return dataset.season as SeasonalTheme | "off" | undefined;
}

describe("новогоднее окно по Москве", () => {
  it("сутки Москвы в ключе YYYY-MM-DD", () => {
    expect(moscowDateKey(new Date("2026-11-26T21:00:00.000Z"))).toBe(
      "2026-11-27",
    );
    expect(moscowDateKey(new Date("2027-01-10T20:59:00.000Z"))).toBe(
      "2027-01-10",
    );
  });

  it("включено с 27 ноября 2026 по 10 января 2027 включительно", () => {
    expect(theme("2026-11-26T20:59:00.000Z")).toBeNull();
    expect(theme("2026-11-26T21:00:00.000Z")).toBe("newyear");
    expect(theme("2026-11-27T06:35:00.000Z")).toBe("newyear");
    expect(theme("2026-12-15T12:00:00.000Z")).toBe("newyear");
    expect(theme("2026-12-31T21:00:00.000Z")).toBe("newyear");
    expect(theme("2027-01-10T20:59:00.000Z")).toBe("newyear");
    expect(theme("2027-01-10T21:00:00.000Z")).toBeNull();
  });

  it("адрес сильнее env, env сильнее календаря", () => {
    expect(theme("2026-12-20T12:00:00.000Z", "off")).toBeNull();
    expect(theme("2026-12-20T12:00:00.000Z", " OFF ")).toBeNull();
    expect(theme("2027-02-01T12:00:00.000Z", "newyear")).toBe("newyear");
    expect(theme("2027-02-01T12:00:00.000Z", "new-year")).toBe("newyear");
    expect(theme("2026-12-20T12:00:00.000Z", null, "off")).toBeNull();
    expect(theme("2027-02-01T12:00:00.000Z", null, "on")).toBe("newyear");
    expect(theme("2026-12-20T12:00:00.000Z", "off", "newyear")).toBeNull();
    expect(theme("2027-02-01T12:00:00.000Z", "newyear", "off")).toBe("newyear");
    expect(theme("2026-12-20T12:00:00.000Z", "нет", null)).toBe("newyear");
    expect(theme("2026-12-20T12:00:00.000Z", null, "auto")).toBe("newyear");
    expect(theme("2027-02-01T12:00:00.000Z", null, "")).toBeNull();
  });

  it("скрипт первой отрисовки совпадает с resolveSeasonalTheme", () => {
    const cases: Array<{
      now: string;
      query: string | null;
      env?: string;
    }> = [
      { now: "2026-11-26T20:59:00.000Z", query: null },
      { now: "2026-11-26T21:00:00.000Z", query: null },
      { now: "2027-01-10T20:59:00.000Z", query: null },
      { now: "2027-01-10T21:00:00.000Z", query: null },
      { now: "2026-12-20T12:00:00.000Z", query: "off" },
      { now: "2027-02-01T12:00:00.000Z", query: "newyear" },
      { now: "2026-12-20T12:00:00.000Z", query: null, env: "off" },
      { now: "2027-02-01T12:00:00.000Z", query: null, env: "newyear" },
      { now: "2026-12-20T12:00:00.000Z", query: "off", env: "newyear" },
      { now: "2027-02-01T12:00:00.000Z", query: "newyear", env: "off" },
    ];
    for (const item of cases) {
      const resolved = resolveSeasonalTheme({
        now: new Date(item.now),
        query: item.query,
        env: item.env,
      });
      const search = item.query ? `?theme=${item.query}` : "";
      expect(boot(item.now, search, item.env)).toBe(resolved ?? "off");
    }
    expect(seasonalBootScript("</script>")).not.toContain("</script>");
  });
});
