/**
 * Превью iTunes для музыкальных вопросов: 30-секундный фрагмент, который
 * Apple отдаёт для прослушивания в браузере. Мы храним только ссылку, сам
 * файл не скачиваем и не размещаем.
 */
const PREVIEW_HOST = /^https:\/\/audio-ssl\.itunes\.apple\.com\//;

export type ItunesPreview = {
  audioUrl: string;
  artist: string;
  track: string;
};

type ItunesResult = {
  previewUrl?: string;
  artistName?: string;
  trackName?: string;
  kind?: string;
};

export async function findItunesPreview(
  query: string,
  country = "ru",
): Promise<ItunesPreview | null> {
  const url = new URL("https://itunes.apple.com/search");
  url.searchParams.set("term", query);
  url.searchParams.set("media", "music");
  url.searchParams.set("entity", "song");
  url.searchParams.set("limit", "5");
  url.searchParams.set("country", country);
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return null;
    const data = (await response.json()) as { results?: ItunesResult[] };
    const hit = (data.results ?? []).find(
      (item) => item.previewUrl && PREVIEW_HOST.test(item.previewUrl),
    );
    if (!hit?.previewUrl) return null;
    return {
      audioUrl: hit.previewUrl,
      artist: hit.artistName ?? "",
      track: hit.trackName ?? "",
    };
  } catch {
    return null;
  }
}
