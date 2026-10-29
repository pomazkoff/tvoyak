// Поиск и проверка роликов VK Видео для генератора и ревью пачек.
// С токеном (VK_API_TOKEN — пользовательский или сервисный ключ с доступом
// к video) — официальный API: video.search / video.get. Без токена поиск
// с сервера невозможен (vkvideo.ru отдаёт ботам 418), поэтому ищем
// скриптом scripts/vk-video/find.mjs в браузере, а встраивание проверяем
// по странице video_ext.php.

import { parseVkVideo, vkEmbedUrl, type VkVideoRef } from "@/lib/media/vk";

const API = "https://api.vk.com/method";
const API_VERSION = "5.199";
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";

export type VkCandidate = VkVideoRef & {
  title: string;
  duration: number;
  views: number;
  embedUrl: string;
  restricted: boolean;
};

type ApiVideo = {
  owner_id: number;
  id: number;
  title?: string;
  duration?: number;
  views?: number;
  player?: string;
  content_restricted?: number;
  restriction?: unknown;
  is_private?: number;
};

export function vkToken(): string | null {
  return process.env.VK_API_TOKEN || process.env.VK_TOKEN || null;
}

async function callApi<T>(
  method: string,
  params: Record<string, string | number>,
  token: string,
): Promise<T> {
  const body = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key, String(value)]),
    ),
    access_token: token,
    v: API_VERSION,
  });
  const response = await fetch(`${API}/${method}`, {
    method: "POST",
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const json = (await response.json()) as {
    response?: T;
    error?: { error_msg?: string };
  };
  if (!json.response) throw new Error(json.error?.error_msg ?? "vk_api");
  return json.response;
}

export function toCandidate(video: ApiVideo): VkCandidate | null {
  const fromPlayer = parseVkVideo(video.player);
  const ref: VkVideoRef = {
    oid: video.owner_id,
    id: video.id,
    hash: fromPlayer?.hash ?? null,
  };
  if (!ref.hash) return null;
  return {
    ...ref,
    title: video.title ?? "",
    duration: video.duration ?? 0,
    views: video.views ?? 0,
    embedUrl: vkEmbedUrl(ref),
    restricted: Boolean(
      video.content_restricted || video.restriction || video.is_private,
    ),
  };
}

/**
 * Кандидаты VK Видео по запросу (сначала VK, YouTube — запасной).
 * Без токена возвращает null: тогда ищет scripts/vk-video/find.mjs.
 */
export async function searchVkVideos(
  query: string,
  options: { count?: number; minDuration?: number; maxDuration?: number } = {},
): Promise<VkCandidate[] | null> {
  const token = vkToken();
  if (!token) return null;
  const result = await callApi<{ items?: ApiVideo[] }>(
    "video.search",
    { q: query, count: options.count ?? 20, sort: 2, adult: 0 },
    token,
  );
  return (result.items ?? [])
    .map(toCandidate)
    .filter((item): item is VkCandidate => Boolean(item && !item.restricted))
    .filter(
      (item) =>
        (!options.minDuration || item.duration >= options.minDuration) &&
        (!options.maxDuration || item.duration <= options.maxDuration),
    );
}

/** Лучший кандидат: длительность ближе к ожидаемой, затем просмотры. */
export function pickVkCandidate(
  items: VkCandidate[],
  expectedDuration?: number | null,
): VkCandidate | null {
  const usable = items.filter((item) => !item.restricted);
  if (!usable.length) return null;
  return [...usable].sort((a, b) => {
    if (expectedDuration) {
      // В пределах 5 с ролики считаем одинаковыми — дальше решают просмотры.
      const bucket = (item: VkCandidate) => {
        const diff = Math.abs(item.duration - expectedDuration);
        return diff <= 5 ? 0 : diff;
      };
      if (bucket(a) !== bucket(b)) return bucket(a) - bucket(b);
    }
    return b.views - a.views;
  })[0]!;
}

export type VkEmbedCheck = {
  status: "passed" | "failed" | "skipped";
  notes: string;
  duration?: number;
};

/** Разбор страницы video_ext.php: плеер, «недоступно» или проверка на робота. */
export function readEmbedPage(html: string): VkEmbedCheck {
  if (
    /Видео недоступно|Видеозапись была удалена|Video is unavailable|has been removed/i.test(
      html,
    )
  )
    return { status: "failed", notes: "VK: видео недоступно" };
  const duration = Number(html.match(/"duration":(\d+)/)?.[1] ?? 0);
  if (/"hls"|"url\d{3,4}"|"dash_/.test(html) || duration > 0)
    return { status: "passed", notes: "VK: плеер отдаётся", duration };
  return {
    status: "skipped",
    notes: "VK не дал проверить без токена (проверка на робота)",
  };
}

/** Доступно ли встраивание: video.get с токеном, иначе страница плеера. */
export async function checkVkEmbed(
  vkUrl: string,
  segmentEnd?: number | null,
): Promise<VkEmbedCheck> {
  const ref = parseVkVideo(vkUrl);
  if (!ref) return { status: "failed", notes: "vk_url не разобран" };
  if (!ref.hash)
    return { status: "failed", notes: "vk_url без hash — плеер не откроется" };
  const token = vkToken();
  let check: VkEmbedCheck;
  if (token) {
    try {
      const result = await callApi<{ items?: ApiVideo[] }>(
        "video.get",
        { videos: `${ref.oid}_${ref.id}`, count: 1 },
        token,
      );
      const item = result.items?.[0];
      if (!item) check = { status: "failed", notes: "VK: ролик не найден" };
      else if (item.content_restricted || item.restriction || item.is_private)
        check = { status: "failed", notes: "VK: ограничен доступ" };
      else
        check = {
          status: "passed",
          notes: "VK: video.get",
          duration: item.duration,
        };
    } catch (error) {
      check = { status: "skipped", notes: `VK API: ${String(error)}` };
    }
  } else {
    try {
      const response = await fetch(
        `https://vk.com/video_ext.php?oid=${ref.oid}&id=${ref.id}&hash=${ref.hash}`,
        {
          headers: { "user-agent": UA, "accept-language": "ru-RU,ru" },
          signal: AbortSignal.timeout(10_000),
        },
      );
      check = response.ok
        ? readEmbedPage(await response.text())
        : { status: "skipped", notes: `VK ответил ${response.status}` };
    } catch (error) {
      check = { status: "skipped", notes: `VK: ${String(error)}` };
    }
  }
  if (
    check.status === "passed" &&
    check.duration &&
    segmentEnd &&
    segmentEnd > check.duration
  )
    return {
      status: "failed",
      notes: `фрагмент до ${segmentEnd} с длиннее ролика (${check.duration} с)`,
      duration: check.duration,
    };
  return check;
}
