/**
 * Имена целей и вирусная петля финала.
 *
 * Кнопки QR и шаринга зовут trackGoal. Если модуль Метрики уже загружен,
 * цель уходит через единый track() — один reachGoal и с UTM.
 * Иначе, если window.ym есть и в очереди виден номер счётчика, зовём
 * reachGoal напрямую. Всегда шлём событие `tvoyak:goal`: слушатель
 * вызывает track() только при `sent === false`, чтобы не посчитать цель
 * дважды.
 *
 * share_click format: stories | square | link | download.
 */

export const GOAL_EVENT = "tvoyak:goal";

export const YM_EVENTS = {
  click_create_room: "click_create_room",
  room_created: "room_created",
  tv_connected: "tv_connected",
  players_joined: "players_joined",
  game_started: "game_started",
  game_finished: "game_finished",
  paywall_view: "paywall_view",
  checkout_start: "checkout_start",
  payment_success: "payment_success",
  final_qr_click: "final_qr_click",
  share_click: "share_click",
  b2b_lead_submit: "b2b_lead_submit",
} as const;

export type YmEvent = (typeof YM_EVENTS)[keyof typeof YM_EVENTS];

export const SHARE_FORMATS = ["stories", "square", "link", "download"] as const;

export type ShareFormat = (typeof SHARE_FORMATS)[number];

export type GoalName = "final_qr_click" | "share_click";

export type GoalDetail = {
  goal: GoalName;
  format?: ShareFormat;
  sent: boolean;
};

const EVENT_SET = new Set<string>(Object.values(YM_EVENTS));

export function isYmEvent(value: string): value is YmEvent {
  return EVENT_SET.has(value);
}

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[] };

type MetrikaWindow = Window & {
  ym?: YmFn;
  Ya?: { _metrika?: { getCounters?: () => Array<{ id?: number }> } };
};

type GoalSender = (goal: GoalName, format?: ShareFormat) => boolean;

let sendGoal: GoalSender | null = null;

/** track.ts подключает единый track(), чтобы не было цикла импортов. */
export function bindGoalSender(sender: GoalSender): void {
  sendGoal = sender;
}

export function metrikaCounterId(scope: MetrikaWindow): number | null {
  const queue = scope.ym && Array.isArray(scope.ym.a) ? scope.ym.a : [];
  for (const entry of queue) {
    if (Array.isArray(entry) && typeof entry[0] === "number") return entry[0];
  }
  try {
    const counters = scope.Ya?._metrika?.getCounters?.();
    const id = counters?.[0]?.id;
    return typeof id === "number" ? id : null;
  } catch {
    return null;
  }
}

export function trackGoal(
  goal: GoalName,
  params?: { format?: ShareFormat },
  scope?: Window,
): void {
  const target = scope ?? (typeof window === "undefined" ? undefined : window);
  if (!target) return;
  const view = target as MetrikaWindow;
  const format = params?.format;
  let sent = false;
  try {
    if (!scope && sendGoal) {
      sent = sendGoal(goal, format);
    } else {
      const id = metrikaCounterId(view);
      if (id != null && typeof view.ym === "function") {
        if (format) view.ym(id, "reachGoal", goal, { format });
        else view.ym(id, "reachGoal", goal);
        sent = true;
      }
    }
  } catch {
    sent = false;
  }
  try {
    const detail: GoalDetail = format ? { goal, format, sent } : { goal, sent };
    view.dispatchEvent(new CustomEvent(GOAL_EVENT, { detail }));
  } catch {
    // Событие — запасной канал. Его сбой не должен ломать финал.
  }
}
