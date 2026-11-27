/**
 * Новогоднее оформление.
 *
 * Само включается с 27 ноября 2026 по 10 января 2027 включительно,
 * по календарным суткам Europe/Moscow (без перехода на летнее время).
 *
 * Перекрытия, от сильного к слабому:
 *   ?theme=newyear | ?theme=off
 *   NEXT_PUBLIC_SEASONAL_THEME=newyear | off
 *   календарь
 */

export const NEW_YEAR_THEME = "newyear" as const;
export type SeasonalTheme = typeof NEW_YEAR_THEME;

export const NEW_YEAR_FROM = "2026-11-27";
export const NEW_YEAR_UNTIL = "2027-01-10";

const MOSCOW = "Europe/Moscow";

export function moscowDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MOSCOW,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export type ThemeForce = SeasonalTheme | "off" | null;

export function parseThemeForce(value: string | null | undefined): ThemeForce {
  if (value == null) return null;
  const token = value.trim().toLowerCase();
  if (!token || token === "auto") return null;
  if (token === "off" || token === "none" || token === "0") return "off";
  if (token === "newyear" || token === "new-year" || token === "on") {
    return NEW_YEAR_THEME;
  }
  return null;
}

export function resolveSeasonalTheme(input: {
  now: Date;
  query?: string | null;
  env?: string | null;
}): SeasonalTheme | null {
  const query = parseThemeForce(input.query);
  if (query === "off") return null;
  if (query === NEW_YEAR_THEME) return NEW_YEAR_THEME;
  const env = parseThemeForce(input.env);
  if (env === "off") return null;
  if (env === NEW_YEAR_THEME) return NEW_YEAR_THEME;
  const day = moscowDateKey(input.now);
  if (day >= NEW_YEAR_FROM && day <= NEW_YEAR_UNTIL) return NEW_YEAR_THEME;
  return null;
}

/**
 * Ставит data-season до первой отрисовки. Та же развилка, что у
 * resolveSeasonalTheme: её сверяет тест, чтобы скрипт не разъехался.
 */
export function seasonalBootScript(env: string | undefined): string {
  const config = JSON.stringify({
    from: NEW_YEAR_FROM,
    until: NEW_YEAR_UNTIL,
    env: env ?? "",
  }).replace(/</g, "\\u003c");
  return `(function(){try{var c=${config};function force(v){v=String(v==null?"":v).trim().toLowerCase();if(!v||v==="auto")return"";if(v==="off"||v==="none"||v==="0")return"off";if(v==="newyear"||v==="new-year"||v==="on")return"newyear";return"";}var q=new URLSearchParams(location.search).get("theme");var picked=force(q)||force(c.env);var on=picked==="newyear";if(!picked){var day=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());on=day>=c.from&&day<=c.until;}document.documentElement.dataset.season=on?"newyear":"off";}catch(e){}})();`;
}
