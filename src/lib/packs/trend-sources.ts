/**
 * Источники трендов для генерации пачек. Чистые парсеры отделены от сети,
 * чтобы их можно было проверить на сохранённых ответах (см. __fixtures__).
 * Каждый источник «мягкий»: таймаут или ошибка дают пустой список и заметку,
 * а не падение всей пачки.
 */

export type TrendItem = {
  source: SourceId;
  title: string;
  artist?: string;
  /** Для YouTube — id ролика, для Apple — id трека (для iTunes lookup). */
  externalId?: string;
};

export type SourceId =
  "youtube" | "yandex" | "deezer" | "apple" | "vk" | "news";

export type SourceResult = {
  source: SourceId;
  label: string;
  items: TrendItem[];
  note: string;
};

type FetchLike = (
  input: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>;

/** Политика, война, криминал и 18+ — в «Своей игре» этого не будет. */
const NEWS_STOP = [
  "путин",
  "кремл",
  "президент",
  "премьер",
  "госдум",
  "депутат",
  "министр",
  "губернат",
  "выбор",
  "голосов",
  "парти",
  "оппозиц",
  "митинг",
  "санкц",
  "войн",
  "воен",
  "фронт",
  "армия",
  "мобилиз",
  "украин",
  "киев",
  "зеленск",
  "нато",
  "трамп",
  "байден",
  "белый дом",
  "израил",
  "хамас",
  "иноагент",
  "экстрем",
  "террор",
  "теракт",
  "взрыв",
  "обстрел",
  "беспилот",
  "ракетн",
  "убий",
  "убит",
  "погиб",
  "умер",
  "скончал",
  "смерт",
  "ушел из жизни",
  "суицид",
  "самоубий",
  "траур",
  "похорон",
  "арест",
  "задерж",
  "уголов",
  "полици",
  "дтп",
  "авари",
  "катастроф",
  "болезн",
  "больн",
  "порно",
  "эрот",
  "секс",
  "18+",
  "наркот",
  "казино",
  "букмекер",
];

/** Короткие слова — только целым словом, иначе «сво» ловит «Свою игру». */
const NEWS_STOP_WORDS = new Set([
  "сво",
  "мид",
  "всу",
  "нато",
  "газа",
  "суд",
  "суда",
  "суде",
  "судом",
  "сша",
]);

export function isOffLimits(title: string): boolean {
  const text = title.toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
  if (NEWS_STOP.some((word) => text.includes(word))) return true;
  return text
    .split(/[^\p{L}\p{N}+]+/u)
    .some((token) => NEWS_STOP_WORDS.has(token));
}

export function decodeEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .trim();
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** api.deezer.com/chart/0/tracks и /playlist/<id> (поле tracks.data). */
export function parseDeezer(text: string, limit = 20): TrendItem[] {
  const root = record(safeJson(text));
  const list = Array.isArray(root.data)
    ? root.data
    : asArray(record(root.tracks).data);
  return list
    .map((raw) => {
      const track = record(raw);
      return {
        source: "deezer" as const,
        title: str(track.title_short) || str(track.title),
        artist: str(record(track.artist).name),
        externalId: track.id != null ? String(track.id) : undefined,
      };
    })
    .filter((item) => item.title && !isOffLimits(item.title))
    .slice(0, limit);
}

/** rss.marketingtools.apple.com/api/v2/ru/music/most-played/N/songs.json */
export function parseAppleRss(text: string, limit = 20): TrendItem[] {
  const feed = record(record(safeJson(text)).feed);
  return asArray(feed.results)
    .map((raw) => {
      const song = record(raw);
      return {
        source: "apple" as const,
        title: str(song.name),
        artist: str(song.artistName),
        externalId: str(song.id) || undefined,
      };
    })
    .filter((item) => item.title && !isOffLimits(item.title))
    .slice(0, limit);
}

/** Piped API /trending?region=RU — тренды YouTube без ключа. */
export function parsePipedTrending(text: string, limit = 12): TrendItem[] {
  return asArray(safeJson(text))
    .map((raw) => {
      const video = record(raw);
      const url = str(video.url);
      const id = url.match(/[?&]v=([\w-]{11})/)?.[1];
      return {
        source: "youtube" as const,
        title: str(video.title),
        artist: str(video.uploaderName) || undefined,
        externalId: id,
      };
    })
    .filter((item) => item.title && !isOffLimits(item.title))
    .slice(0, limit);
}

/** api.music.yandex.net/landing3/chart/russia (result.chart.tracks[].track). */
export function parseYandexChart(text: string, limit = 20): TrendItem[] {
  const result = record(record(safeJson(text)).result);
  const chart = record(result.chart);
  return asArray(chart.tracks)
    .map((raw) => {
      const track = record(record(raw).track);
      const artists = asArray(track.artists)
        .map((artist) => str(record(artist).name))
        .filter(Boolean);
      return {
        source: "yandex" as const,
        title: str(track.title),
        artist: artists.join(", "),
        externalId: track.id != null ? String(track.id) : undefined,
      };
    })
    .filter((item) => item.title && !isOffLimits(item.title))
    .slice(0, limit);
}

/** Заголовки <item><title> из RSS, без политики и криминала. */
export function parseRssTitles(xml: string, limit = 10): TrendItem[] {
  return [...xml.matchAll(/<item\b[\s\S]*?<\/item>/g)]
    .map((match) => match[0].match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "")
    .map(decodeEntities)
    .filter((title) => title && !isOffLimits(title))
    .slice(0, limit)
    .map((title) => ({ source: "news" as const, title }));
}

type SourceSpec = {
  source: SourceId;
  label: string;
  urls: string[];
  parse: (text: string) => TrendItem[];
};

const PIPED = [
  "https://api.piped.private.coffee",
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
];

export const SOURCES: SourceSpec[] = [
  {
    source: "youtube",
    label: "YouTube тренды RU (Piped)",
    urls: PIPED.map((base) => `${base}/trending?region=RU`),
    parse: (text) => parsePipedTrending(text),
  },
  {
    source: "yandex",
    label: "Яндекс Музыка, чарт",
    urls: ["https://api.music.yandex.net/landing3/chart/russia"],
    parse: (text) => parseYandexChart(text),
  },
  {
    source: "deezer",
    label: "Deezer, чарт",
    urls: ["https://api.deezer.com/chart/0/tracks?limit=25"],
    parse: (text) => parseDeezer(text),
  },
  {
    source: "apple",
    label: "Apple Music RU, топ песен",
    urls: [
      "https://rss.marketingtools.apple.com/api/v2/ru/music/most-played/25/songs.json",
    ],
    parse: (text) => parseAppleRss(text),
  },
  {
    source: "news",
    label: "Новости (культура, спорт)",
    urls: [
      "https://lenta.ru/rss/news/culture",
      "https://lenta.ru/rss/news/sport",
      "https://www.championat.com/rss/news/",
      "https://www.kommersant.ru/RSS/section-culture.xml",
    ],
    parse: (text) => parseRssTitles(text, 8),
  },
];

async function fetchText(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<string> {
  const response = await fetchImpl(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "User-Agent": "Mozilla/5.0 (tvoyak trends)" },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/**
 * YouTube берём с первого живого зеркала, новости — со всех лент сразу.
 * Ошибки не пробрасываем: источник просто пишет, почему он пуст.
 */
export async function runSource(
  spec: SourceSpec,
  fetchImpl: FetchLike,
  timeoutMs = 6000,
): Promise<SourceResult> {
  const items: TrendItem[] = [];
  const errors: string[] = [];
  const all = spec.source === "news";
  for (const url of spec.urls) {
    try {
      const parsed = spec.parse(await fetchText(fetchImpl, url, timeoutMs));
      items.push(...parsed);
      if (!all && parsed.length) break;
      if (!parsed.length) errors.push("пусто");
    } catch (error) {
      const message = error instanceof Error ? error.message : "ошибка";
      errors.push(
        message.includes("abort") || message.includes("timeout")
          ? "таймаут"
          : message,
      );
    }
  }
  const note = items.length
    ? `${spec.label}: ${items.length}`
    : `${spec.label}: недоступен (${[...new Set(errors)].join(", ") || "пусто"})`;
  return { source: spec.source, label: spec.label, items, note };
}

export async function collectTrendSources(
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  timeoutMs = 6000,
): Promise<SourceResult[]> {
  const results = await Promise.all(
    SOURCES.map((spec) => runSource(spec, fetchImpl, timeoutMs)),
  );
  // У VK Видео нет публичного API трендов без входа (vkvideo.ru уводит на
  // login.vk.ru), поэтому источник честно помечен, а не изображён.
  results.push({
    source: "vk",
    label: "VK Видео",
    items: [],
    note: "VK Видео: нет публичного API без входа",
  });
  return results;
}

/** Темы для генерации: понемногу из каждого источника, без повторов. */
export function topicsFrom(results: SourceResult[], max = 16): string[] {
  const perSource: Record<SourceId, number> = {
    youtube: 4,
    yandex: 4,
    deezer: 3,
    apple: 4,
    vk: 0,
    news: 5,
  };
  const seen = new Set<string>();
  const topics: string[] = [];
  for (const result of results) {
    for (const item of result.items.slice(0, perSource[result.source])) {
      const topic = item.artist ? `${item.artist} — ${item.title}` : item.title;
      const key = topic.toLocaleLowerCase("ru-RU");
      if (seen.has(key)) continue;
      seen.add(key);
      topics.push(topic);
    }
  }
  return topics.slice(0, max);
}
