/**
 * Проверка файлов Wikimedia Commons: существует, свободная лицензия, есть
 * превью нужной ширины. Отсюда же берутся автор и лицензия для подписи.
 */
const UA = { "User-Agent": "TvoyakQuiz/1.0 (party quiz; license check)" };

export const COMMONS_FILEPATH =
  "https://commons.wikimedia.org/wiki/Special:FilePath/";

/** Свободные лицензии, которые можно показывать с подписью. */
const FREE_LICENSE =
  /^(public domain|pd\b|pd-|cc0|cc[ -]?by(?:[ -]sa)?(?:[ -]\d(?:\.\d)?)?|cc by|fal|free art|gfdl|mpl|mozilla public|apache|mit\b|bsd)/i;

export function isFreeLicense(name: string | null | undefined): boolean {
  if (!name) return false;
  if (/non-?free|fair use|copyrighted/i.test(name)) return false;
  return FREE_LICENSE.test(name.trim());
}

export function commonsImageUrl(file: string, width = 960): string {
  return `${COMMONS_FILEPATH}${encodeURIComponent(file.replaceAll(" ", "_"))}?width=${width}`;
}

export function commonsPageUrl(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file.replaceAll(" ", "_"))}`;
}

/** Имя файла из ссылки Special:FilePath или upload.wikimedia.org. */
export function commonsFileFromUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.hostname === "commons.wikimedia.org") {
      const match = url.pathname.match(
        /\/wiki\/(?:Special:FilePath\/|File:)(.+)$/,
      );
      return match ? decodeURIComponent(match[1]).replaceAll("_", " ") : null;
    }
    if (url.hostname === "upload.wikimedia.org") {
      const parts = url.pathname.split("/");
      const index = parts.indexOf("thumb");
      const name = index >= 0 ? parts[index + 3] : parts.at(-1);
      return name ? decodeURIComponent(name).replaceAll("_", " ") : null;
    }
  } catch {
    return null;
  }
  return null;
}

export type CommonsFile = {
  file: string;
  license: string;
  artist: string;
  attributionRequired: boolean;
  thumb: string | null;
  width: number;
  height: number;
  mime: string;
};

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export async function lookupCommons(file: string): Promise<CommonsFile | null> {
  const params = new URLSearchParams({
    action: "query",
    titles: `File:${file}`,
    prop: "imageinfo",
    iiprop: "url|extmetadata|size|mime",
    iiurlwidth: "960",
    iiextmetadatafilter: "LicenseShortName|Artist|AttributionRequired",
    format: "json",
    redirects: "1",
  });
  let response: Response | null = null;
  // Commons отвечает 429 на частые запросы — пара повторов с паузой.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(
      `https://commons.wikimedia.org/w/api.php?${params}`,
      { headers: UA, signal: AbortSignal.timeout(10_000) },
    ).catch(() => null);
    if (response && response.status !== 429 && response.status < 500) break;
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  if (!response?.ok) return null;
  const data = (await response.json()) as {
    query?: {
      pages?: Record<
        string,
        { title: string; imageinfo?: Array<Record<string, unknown>> }
      >;
    };
  };
  const page = Object.values(data.query?.pages ?? {})[0];
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const meta = (info.extmetadata ?? {}) as Record<string, { value?: unknown }>;
  return {
    file: page.title.replace(/^File:/, ""),
    license: clean(meta.LicenseShortName?.value),
    artist: clean(meta.Artist?.value).slice(0, 160),
    attributionRequired: clean(meta.AttributionRequired?.value) !== "false",
    thumb: typeof info.thumburl === "string" ? info.thumburl : null,
    width: Number(info.width ?? 0),
    height: Number(info.height ?? 0),
    mime: String(info.mime ?? ""),
  };
}

/** Ссылка отдаёт картинку (200 и image/*). */
export async function imageReachable(url: string): Promise<boolean> {
  let response: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    response = await fetch(url, {
      headers: UA,
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (response && response.status !== 429 && response.status < 500) break;
    await response?.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
  }
  if (!response) return false;
  const ok =
    response.status === 200 &&
    (response.headers.get("content-type") ?? "").startsWith("image/");
  await response.body?.cancel().catch(() => undefined);
  return ok;
}
