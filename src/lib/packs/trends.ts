import "server-only";

const FALLBACK = [
  "хиты чартов этой недели",
  "клипы на YouTube",
  "популярные сериалы",
  "мемы",
  "футбол и олимпийский спорт",
  "новые гаджеты",
  "игры, в которые играют сейчас",
  "мультфильмы, которые все узнают",
];

export async function collectTrends(): Promise<{
  topics: string[];
  notes: string;
}> {
  const topics: string[] = [];
  const notes: string[] = [];

  try {
    const response = await fetch(
      "https://www.youtube.com/feeds/videos.xml?chart=mostPopular&gl=RU",
      { signal: AbortSignal.timeout(8000) },
    );
    if (response.ok) {
      const xml = await response.text();
      const titles = [...xml.matchAll(/<title>([^<]+)<\/title>/g)]
        .map((match) => decode(match[1] ?? ""))
        .filter((title) => title && title !== "YouTube")
        .slice(0, 8);
      topics.push(...titles);
      notes.push(`YouTube popular RU: ${titles.length}`);
    } else {
      notes.push(`YouTube ${response.status}`);
    }
  } catch {
    notes.push("YouTube недоступен");
  }

  if (topics.length < 4) {
    topics.push(...FALLBACK);
    notes.push("запасные темы без политики");
  }

  return { topics: topics.slice(0, 12), notes: notes.join("; ") };
}

function decode(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .trim();
}
