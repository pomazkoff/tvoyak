/** Темы, которые этот браузер только что закрепил за комнатой. */

export const PICKED_THEMES_KEY = "tvoyak.pickedThemes";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function savePickedThemes(
  storage: StorageLike | null | undefined,
  code: string,
  categories: string[],
): void {
  try {
    storage?.setItem(PICKED_THEMES_KEY, JSON.stringify({ code, categories }));
  } catch {
    // Комната уже создана: плашка в лобби необязательна.
  }
}

export function clearPickedThemes(
  storage: StorageLike | null | undefined,
): void {
  try {
    storage?.removeItem(PICKED_THEMES_KEY);
  } catch {
    // Нет доступа к хранилищу — нечего чистить.
  }
}

/** 12 тем этой комнаты или null, если набор не выбирали (или это другой код). */
export function readPickedThemes(
  storage: StorageLike | null | undefined,
  code: string,
): string[] | null {
  try {
    const raw = storage?.getItem(PICKED_THEMES_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      code?: unknown;
      categories?: unknown;
    };
    if (parsed.code !== code || !Array.isArray(parsed.categories)) return null;
    if (parsed.categories.length !== 12) return null;
    if (!parsed.categories.every((item) => typeof item === "string"))
      return null;
    return parsed.categories as string[];
  } catch {
    return null;
  }
}
