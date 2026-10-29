// VK Видео: разбор ссылок, сборка src плеера для экрана вопроса и границы
// фрагмента. В БД (vk_url) храним каноническую ссылку на встраивание
// https://vkvideo.ru/video_ext.php?oid=..&id=..&hash=.. — без hash VK
// отдаёт «Видео недоступно».

export type VkVideoRef = { oid: number; id: number; hash: string | null };

const EMBED_BASE = "https://vkvideo.ru/video_ext.php";
/** JS API плеера: VK.VideoPlayer(iframe) — play/pause/seek/timeupdate. */
export const VK_PLAYER_API = "https://vk.com/js/api/videoplayer.js";

/**
 * Принимает video_ext.php-ссылку (vk.com или vkvideo.ru), обычную ссылку
 * на ролик (vkvideo.ru/video-123_456, vk.com/video?z=video-123_456) или
 * «-123_456». Возвращает null, если идентификатор не нашёлся.
 */
export function parseVkVideo(
  input: string | null | undefined,
): VkVideoRef | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (/video_ext\.php$/.test(url.pathname)) {
      const oid = Number(url.searchParams.get("oid"));
      const id = Number(url.searchParams.get("id"));
      if (!Number.isInteger(oid) || !Number.isInteger(id) || !id) return null;
      return { oid, id, hash: url.searchParams.get("hash") || null };
    }
  } catch {
    // не URL — пробуем как «-123_456»
  }
  const match = raw.match(/video(-?\d+)_(\d+)/) ?? raw.match(/^(-?\d+)_(\d+)$/);
  if (!match) return null;
  return { oid: Number(match[1]), id: Number(match[2]), hash: null };
}

export function vkEmbedUrl(ref: VkVideoRef): string {
  const hash = ref.hash ? `&hash=${encodeURIComponent(ref.hash)}` : "";
  return `${EMBED_BASE}?oid=${ref.oid}&id=${ref.id}${hash}`;
}

/** Страница ролика — для ведущего и ревью. */
export function vkWatchUrl(ref: VkVideoRef): string {
  return `https://vkvideo.ru/video${ref.oid}_${ref.id}`;
}

/**
 * src для iframe на экране вопроса: JS API, HD, автозапуск и старт с нужной
 * секунды (VK понимает t=30s). Останавливает фрагмент MediaPlayer по
 * timeupdate.
 */
export function vkPlayerSrc(
  vkUrl: string,
  start: number | null | undefined,
  autoplay = true,
): string | null {
  const ref = parseVkVideo(vkUrl);
  if (!ref) return null;
  const from = Math.max(0, Math.floor(start ?? 0));
  const params = ["hd=2", "js_api=1"];
  if (autoplay) params.push("autoplay=1");
  if (from) params.push(`t=${from}s`);
  return `${vkEmbedUrl(ref)}&${params.join("&")}`;
}

/** Границы фрагмента для VK: свои таймкоды, иначе общие. */
export function vkSegment(cell: {
  vk_start_seconds?: number | null;
  vk_end_seconds?: number | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
}): { start: number; end: number | null } {
  const ownStart = cell.vk_start_seconds;
  const start = Math.max(0, ownStart ?? cell.start_seconds ?? 0);
  let end =
    ownStart != null
      ? (cell.vk_end_seconds ?? null)
      : (cell.vk_end_seconds ?? cell.end_seconds ?? null);
  if (end != null && end <= start) end = null;
  return { start, end };
}
