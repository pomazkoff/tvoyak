import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  UTM_TTL_MS,
  parseUtmSearch,
  readUtmTouch,
  rememberUtmTouch,
  resetUtmFallback,
  sanitizeUtm,
  utmForApi,
} from "./utm";

function installBrowser() {
  const store = new Map<string, string>();
  let cookie = "";
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("document", {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      cookie = value;
    },
  });
  vi.stubGlobal("location", { protocol: "https:" });
  return { store, localStorage };
}

describe("parseUtmSearch", () => {
  it("берёт пять меток и отбрасывает остальное", () => {
    expect(
      parseUtmSearch(
        "?utm_source=ya&utm_medium=cpc&utm_campaign=spring&utm_content=banner&utm_term=quiz&x=1",
      ),
    ).toEqual({
      source: "ya",
      medium: "cpc",
      campaign: "spring",
      content: "banner",
      term: "quiz",
    });
  });

  it("без меток — пусто", () => {
    expect(parseUtmSearch("?code=ZEMT")).toBeUndefined();
  });

  it("выбрасывает почту и телефон", () => {
    expect(
      parseUtmSearch(
        "?utm_source=ads&utm_campaign=a@b.c&utm_term=+79991234567&utm_content=89991234567",
      ),
    ).toEqual({ source: "ads" });
  });

  it("режет слишком длинную метку, но не теряет её", () => {
    const campaign = "a".repeat(140);
    expect(parseUtmSearch(`?utm_campaign=${campaign}`)?.campaign).toHaveLength(
      100,
    );
  });
});

describe("first and last touch", () => {
  beforeEach(() => {
    installBrowser();
    resetUtmFallback();
  });

  afterEach(() => {
    resetUtmFallback();
    vi.unstubAllGlobals();
  });

  it("первое касание не затирается, последнее обновляется", () => {
    rememberUtmTouch("?utm_source=ya&utm_medium=cpc", 1_000);
    rememberUtmTouch("?utm_source=tg&utm_medium=social", 2_000);
    expect(readUtmTouch(2_000)).toEqual({
      first: { source: "ya", medium: "cpc" },
      last: { source: "tg", medium: "social" },
    });
  });

  it("адрес без меток не стирает сохранённое", () => {
    rememberUtmTouch("?utm_source=ya", 1_000);
    rememberUtmTouch("?code=ABCD", 2_000);
    expect(readUtmTouch(2_000).last).toEqual({ source: "ya" });
    expect(readUtmTouch(2_000).first).toEqual({ source: "ya" });
  });

  it("после 30 дней новое касание становится первым", () => {
    rememberUtmTouch("?utm_source=ya", 0);
    const later = UTM_TTL_MS + 1;
    expect(readUtmTouch(later).first).toBeUndefined();
    rememberUtmTouch("?utm_source=new", later);
    expect(readUtmTouch(later)).toEqual({
      first: { source: "new" },
      last: { source: "new" },
    });
  });

  it("читает куку, если localStorage пуст", () => {
    const { localStorage } = installBrowser();
    rememberUtmTouch("?utm_source=ya&utm_medium=cpc", 5_000);
    localStorage.clear();
    resetUtmFallback();
    expect(readUtmTouch(5_000)).toEqual({
      first: { source: "ya", medium: "cpc" },
      last: { source: "ya", medium: "cpc" },
    });
  });

  it("utmForApi не отдаёт пустой объект", () => {
    expect(utmForApi()).toBeUndefined();
    rememberUtmTouch("?utm_source=ya", 1);
    expect(utmForApi(1)).toEqual({
      first: { source: "ya" },
      last: { source: "ya" },
    });
  });
});

describe("sanitizeUtm", () => {
  it("оставляет только first/last и пять полей", () => {
    expect(
      sanitizeUtm({
        first: { source: "ya", email: "a@b.c", name: "Анна" },
        last: { medium: "cpc", phone: "+79991234567" },
        email: "a@b.c",
        nickname: "Анна",
      }),
    ).toEqual({
      first: { source: "ya" },
      last: { medium: "cpc" },
    });
  });

  it("мусор — null", () => {
    expect(sanitizeUtm(null)).toBeNull();
    expect(sanitizeUtm("ya")).toBeNull();
    expect(sanitizeUtm({ first: { source: "a@b.c" } })).toBeNull();
    expect(sanitizeUtm([])).toBeNull();
  });
});
