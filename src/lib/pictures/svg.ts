import { emojisOf, renderPicture } from "./render";
import { loadTwemoji } from "./twemoji";
import type { PictureFormat } from "./types";

/** Собрать SVG картинки задания (ребус, эмодзи, «найди лишнее»). */
export async function buildPictureSvg(
  format: PictureFormat,
  spec: unknown,
): Promise<string | null> {
  const emojis = Array.from(new Set(emojisOf(format, spec)));
  const loaded = await Promise.all(emojis.map((emoji) => loadTwemoji(emoji)));
  const art = new Map(emojis.map((emoji, index) => [emoji, loaded[index]]));
  return renderPicture(format, spec, (emoji) => art.get(emoji) ?? null);
}
