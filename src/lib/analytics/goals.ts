/**
 * Цели вирусной петли, не завязанные на модуль Метрики из соседнего PR.
 *
 * 1. Если `window.ym` уже есть и виден номер счётчика (очередь инициализации
 *    `ym.a` или `Ya._metrika.getCounters()`), зовём
 *    `ym(id, "reachGoal", goal, { format })`.
 * 2. Всегда шлём `window` событие `tvoyak:goal`. В `detail.sent` — ушёл ли
 *    прямой вызов. Слушатель track() должен звать reachGoal только когда
 *    `sent === false`, иначе цель посчитается дважды.
 *
 * Цели: `final_qr_click` и `share_click`.
 * У share_click параметр format: stories | square | link | download.
 * stories/square — ушла картинка файлом, link — вместо файла ушла ссылка
 * на итог, download — нажата «Скачать картинку».
 */

export const GOAL_EVENT = "tvoyak:goal";

export type ShareFormat = "stories" | "square" | "link" | "download";

export type GoalName = "final_qr_click" | "share_click";

export type GoalDetail = {
  goal: GoalName;
  format?: ShareFormat;
  sent: boolean;
};

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[] };

type MetrikaWindow = Window & {
  ym?: YmFn;
  Ya?: { _metrika?: { getCounters?: () => Array<{ id?: number }> } };
};

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
    const id = metrikaCounterId(view);
    if (id != null && typeof view.ym === "function") {
      if (format) view.ym(id, "reachGoal", goal, { format });
      else view.ym(id, "reachGoal", goal);
      sent = true;
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
