/**
 * Пиксель VK Рекламы (счётчик Top@Mail.ru). Без NEXT_PUBLIC_VK_PIXEL_ID
 * все функции — пустышки, на сервере тоже.
 */
export const VK_PIXEL_ID = process.env.NEXT_PUBLIC_VK_PIXEL_ID?.trim() || "";

export type VkGoal =
  "room_created" | "game_started" | "player_joined" | "b2b_lead_submitted";

type TmrEvent = Record<string, unknown>;

function queue(): TmrEvent[] | null {
  if (!VK_PIXEL_ID || typeof window === "undefined") return null;
  const w = window as unknown as { _tmr?: TmrEvent[] };
  w._tmr = w._tmr || [];
  return w._tmr;
}

export function vkPageView(url?: string): void {
  queue()?.push({
    id: VK_PIXEL_ID,
    type: "pageView",
    start: Date.now(),
    ...(url ? { url } : {}),
  });
}

export function vkGoal(goal: VkGoal): void {
  queue()?.push({ id: VK_PIXEL_ID, type: "reachGoal", goal });
}

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;
const UTM_STORAGE = "tvoyak:utm";

/** Метки из адреса (первое касание сохраняется на 30 дней). */
export function pickUtm(search: string): Record<string, string> | null {
  const params = new URLSearchParams(search);
  const out: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) out[key] = value.slice(0, 100);
  }
  const clickId = params.get("rb_clickid");
  if (clickId) out.rb_clickid = clickId.slice(0, 100);
  return Object.keys(out).length ? out : null;
}

export function rememberUtm(search: string, now = Date.now()): void {
  try {
    const utm = pickUtm(search);
    if (!utm) return;
    const prev = readUtm(now);
    if (prev) return;
    localStorage.setItem(UTM_STORAGE, JSON.stringify({ at: now, utm }));
  } catch {
    // localStorage недоступен — не страшно.
  }
}

export function readUtm(now = Date.now()): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(UTM_STORAGE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      at: number;
      utm: Record<string, string>;
    };
    if (now - parsed.at > 30 * 24 * 3600 * 1000) return null;
    return parsed.utm;
  } catch {
    return null;
  }
}
