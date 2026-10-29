// Ревью видеовопросов: сначала VK Видео (основной плеер), YouTube — запасной.
// Если у черновика нет vk_url, а есть токен VK — ищем копию через
// video.search; встраивание VK проверяем всегда.

import { vkSegment } from "@/lib/media/vk";
import {
  checkVkEmbed,
  pickVkCandidate,
  searchVkVideos,
  type VkEmbedCheck,
} from "@/lib/media/vk-search";
import type { DraftQuestion } from "@/lib/packs/review";

export type MediaReview = {
  draft: DraftQuestion;
  status: "passed" | "failed" | "skipped";
  notes: string;
};

type Deps = {
  check?: typeof checkVkEmbed;
  search?: typeof searchVkVideos;
};

export function needsMediaReview(draft: DraftQuestion): boolean {
  return (
    (draft.kind === "video" || draft.kind === "music") &&
    Boolean(draft.vk_url || draft.youtube_id || draft.vk_query)
  );
}

export async function reviewMedia(
  input: DraftQuestion,
  deps: Deps = {},
): Promise<MediaReview> {
  const check = deps.check ?? checkVkEmbed;
  const search = deps.search ?? searchVkVideos;
  let draft = { ...input };
  const notes: string[] = [];

  if (!draft.vk_url && draft.vk_query) {
    try {
      const found = await search(draft.vk_query, { minDuration: 10 });
      if (found === null) notes.push("поиск VK без токена — нужен find.mjs");
      else {
        const best = pickVkCandidate(found, draft.vk_duration ?? null);
        if (best) {
          draft = { ...draft, vk_url: best.embedUrl };
          notes.push(`VK найден: ${best.title.slice(0, 60)}`);
        } else notes.push("VK: подходящего ролика нет");
      }
    } catch (error) {
      notes.push(`поиск VK: ${String(error)}`);
    }
  }

  if (draft.vk_url) {
    const result: VkEmbedCheck = await check(
      draft.vk_url,
      vkSegment(draft).end,
    );
    notes.push(result.notes);
    if (result.status === "failed") {
      if (draft.youtube_id) {
        notes.push("остаётся YouTube");
        draft = {
          ...draft,
          vk_url: null,
          vk_start_seconds: null,
          vk_end_seconds: null,
        };
        return { draft, status: "passed", notes: notes.join("; ") };
      }
      return { draft, status: "failed", notes: notes.join("; ") };
    }
    return { draft, status: result.status, notes: notes.join("; ") };
  }
  if (!draft.youtube_id && !draft.audio_url)
    return {
      draft,
      status: "failed",
      notes: [...notes, "у видеовопроса нет ни VK, ни YouTube"].join("; "),
    };
  return {
    draft,
    status: "passed",
    notes: [...notes, "только YouTube"].join("; "),
  };
}
