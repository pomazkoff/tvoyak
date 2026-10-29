import "server-only";
import { collectTrendSources, topicsFrom } from "@/lib/packs/trend-sources";

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
  const results = await collectTrendSources();
  const topics = topicsFrom(results);
  const notes = results.map((result) => result.note);
  if (topics.length < 4) {
    topics.push(...FALLBACK);
    notes.push("запасные темы без политики");
  }
  return { topics: topics.slice(0, 16), notes: notes.join("; ") };
}
