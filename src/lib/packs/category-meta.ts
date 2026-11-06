import { specialCategory } from "@/lib/packs/categories";

/**
 * Тип темы для сбалансированного поля (таблица category_meta): в каждом
 * раунде 3 текстовые темы, 1 музыкальная, 1 медиа (видео или картинки)
 * и 1 «головоломка» нового формата.
 */
export type CategoryKind = "text" | "music" | "video" | "picture" | "brain";

export type CategoryMediaRow = {
  kind?: string | null;
  picture?: string | null;
  audio_url?: string | null;
  youtube_id?: string | null;
  vk_url?: string | null;
  rutube_url?: string | null;
};

/**
 * Тип новой темы по медиа её вопросов: если хотя бы половина вопросов —
 * картиночные задания, аудио или видео, тема получает этот тип; текстовые
 * особые форматы (SPECIAL_CATEGORIES без media) — «brain»; иначе «text».
 */
export function categoryKindFromRows(
  category: string,
  rows: CategoryMediaRow[],
): CategoryKind {
  const special = specialCategory(category);
  if (special?.media) return special.media;
  if (rows.length) {
    const half = rows.length / 2;
    const count = (test: (row: CategoryMediaRow) => boolean) =>
      rows.filter(test).length;
    const picture = count((row) => Boolean(row.picture));
    const music = count((row) => Boolean(row.audio_url));
    const video = count(
      (row) =>
        !row.audio_url &&
        Boolean(row.youtube_id || row.vk_url || row.rutube_url),
    );
    const best = Math.max(picture, music, video);
    if (best >= half && best > 0) {
      if (picture === best) return "picture";
      if (music === best) return "music";
      return "video";
    }
  }
  if (special) return "brain";
  return "text";
}

/** Строки category_meta для тем партии: по одной на тему. */
export function categoryMetaRows(
  rows: (CategoryMediaRow & { category: string })[],
): { category: string; kind: CategoryKind; family: null }[] {
  const byCategory = new Map<string, CategoryMediaRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.category) ?? [];
    list.push(row);
    byCategory.set(row.category, list);
  }
  return [...byCategory].map(([category, list]) => ({
    category,
    kind: categoryKindFromRows(category, list),
    family: null,
  }));
}
