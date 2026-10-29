import type { BoardCell } from "@/components/game/board";

/**
 * На экране вопрос со своим звуком (ролик YouTube/VK/Rutube или превью
 * трека) — фоновую музыку на это время ставим на паузу. Держим паузу и на
 * вскрытии ответа: ролик остаётся на экране до возврата на поле.
 */
export function mediaPlaysSound(
  cell: Pick<
    BoardCell,
    "kind" | "youtube_id" | "vk_url" | "rutube_url" | "audio_url"
  >,
  phase: string,
): boolean {
  if (["lobby", "board", "cat_pick", "finished"].includes(phase)) return false;
  if (cell.kind !== "video" && cell.kind !== "music") return false;
  return Boolean(
    cell.youtube_id || cell.vk_url || cell.rutube_url || cell.audio_url,
  );
}
