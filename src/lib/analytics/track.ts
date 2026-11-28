import { PRODUCTS } from "@/lib/billing/products";
import {
  GOAL_EVENT,
  YM_EVENTS,
  bindGoalSender,
  isYmEvent,
  type GoalDetail,
  type GoalName,
  type ShareFormat,
  type YmEvent,
} from "./goals";
import { goalParams, isUuid, type AnalyticsInput } from "./params";
import { readUtmTouch, type UtmRecord } from "./utm";

type YmFn = ((...args: unknown[]) => void) & { a?: unknown[]; l?: number };

const ONCE_PREFIX = "tvoyak:ym:once:";
const STARTER_PREFIX = "tvoyak:ym:starter:";

const memoryOnce = new Set<string>();
const memoryStarters = new Set<string>();
let bootedId: number | null = null;

/** Счётчик tvoyak.ru. Не секрет: это номер публичного счётчика Метрики. */
export const YM_DEFAULT_ID = "114751032";

const PRODUCTION_HOSTS = new Set(["tvoyak.ru", "www.tvoyak.ru"]);

/** Память вкладки между тестами. На сайт не влияет. */
export function resetAnalyticsMemory(): void {
  memoryOnce.clear();
  memoryStarters.clear();
  bootedId = null;
}

function parseCounterId(raw: string): number | null {
  if (!/^\d{5,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isInteger(id) ? id : null;
}

/**
 * Id счётчика, если хиты вообще можно слать.
 * Пустой NEXT_PUBLIC_YM_ID на проде tvoyak.ru даёт YM_DEFAULT_ID.
 * Превью, localhost и прочий хост — null, чтобы не сорить в статистику.
 * Явное, но нечисловое значение не подменяется дефолтом.
 */
export function ymCounterId(): number | null {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV !== "production") return null;
  if (typeof window === "undefined") return null;
  const host = window.location?.hostname?.toLowerCase() ?? "";
  if (!PRODUCTION_HOSTS.has(host)) return null;
  const configured = process.env.NEXT_PUBLIC_YM_ID?.trim() ?? "";
  return parseCounterId(configured || YM_DEFAULT_ID);
}

/** Вставляет tag.js один раз. Скрипт в JSX после гидрации браузер не выполняет. */
export function bootYandexMetrika(id: number): void {
  if (typeof document === "undefined" || bootedId === id) return;
  bootedId = id;
  if (document.getElementById("yandex-metrika")) return;
  const snippet = ymInitSnippet(id);
  if (!snippet) return;
  const script = document.createElement("script");
  script.id = "yandex-metrika";
  script.text = snippet;
  (document.head || document.documentElement).appendChild(script);
}

/**
 * Официальный загрузчик tag.js. Id только числом, чтобы сниппет нельзя
 * было подменить. Пустая строка — счётчик не вставляем.
 */
export function ymInitSnippet(id: number): string {
  if (!Number.isInteger(id) || id < 10_000 || id > 999_999_999_999) return "";
  return (
    `(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};` +
    `m[i].l=1*new Date();for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}` +
    `k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})` +
    `(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");` +
    `ym(${id},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});`
  );
}

function queue(): YmFn | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & { ym?: YmFn };
  if (typeof host.ym !== "function") {
    // Очередь до загрузки tag.js: он потом делает apply по каждому вызову.
    const ym = function ym(...args: unknown[]) {
      const fn = ym as YmFn;
      fn.a = fn.a || [];
      fn.a.push(args);
    } as YmFn;
    ym.l = Date.now();
    host.ym = ym;
  }
  return host.ym;
}

function callYm(method: string, ...args: unknown[]): void {
  const id = ymCounterId();
  if (!id) return;
  queue()?.(id, method, ...args);
}

export function ymHit(url: string, title?: string): void {
  if (!url) return;
  const options: Record<string, string> = {};
  if (title) options.title = title;
  callYm("hit", url, options);
}

function readUtm(): UtmRecord {
  try {
    return readUtmTouch();
  } catch {
    return {};
  }
}

/** reachGoal. Без счётчика и на сервере — тишина. true, если вызов ушёл в ym. */
export function track(event: YmEvent, params?: AnalyticsInput): boolean {
  if (!isYmEvent(event) || !ymCounterId()) return false;
  const goal = goalParams(
    params as Record<string, unknown> | undefined,
    readUtm(),
  );
  const args: unknown[] = [event];
  if (Object.keys(goal).length) args.push(goal);
  callYm("reachGoal", ...args);
  return true;
}

/**
 * final_qr_click и share_click. Если trackGoal уже отправил цель
 * (`sent === true`), второй reachGoal не зовём.
 */
export function listenForGoalEvents(): void {
  if (typeof window === "undefined") return;
  const host = window as Window & { __tvoyakGoalBridge?: boolean };
  if (host.__tvoyakGoalBridge || typeof host.addEventListener !== "function") {
    return;
  }
  host.__tvoyakGoalBridge = true;
  host.addEventListener(GOAL_EVENT, (event) => {
    const detail = (event as CustomEvent<GoalDetail>).detail;
    if (!detail || detail.sent !== false) return;
    if (detail.goal !== "final_qr_click" && detail.goal !== "share_click") {
      return;
    }
    const params: AnalyticsInput | undefined = detail.format
      ? { format: detail.format }
      : undefined;
    track(detail.goal, params);
  });
}

bindGoalSender((goal: GoalName, format?: ShareFormat) =>
  track(goal, format ? { format } : undefined),
);
listenForGoalEvents();

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string): boolean {
  try {
    localStorage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

/** true, если это первое срабатывание ключа в этом браузере. */
export function claimOnce(event: YmEvent, key: string): boolean {
  const storageKey = `${ONCE_PREFIX}${event}:${key}`;
  if (storageGet(storageKey)) return false;
  if (!storageSet(storageKey)) {
    if (memoryOnce.has(storageKey)) return false;
    memoryOnce.add(storageKey);
  }
  return true;
}

/** Один раз на ключ. Повторный рендер и обновление вкладки событие не дублируют. */
export function trackOnce(
  event: YmEvent,
  key: string,
  params?: AnalyticsInput,
): void {
  if (!ymCounterId() || !key || !claimOnce(event, key)) return;
  track(event, params);
}

function markStarter(roomId: string): void {
  memoryStarters.add(roomId);
  try {
    localStorage.setItem(`${STARTER_PREFIX}${roomId}`, "1");
  } catch {
    // флаг останется в памяти вкладки
  }
}

function isStarter(roomId: string): boolean {
  if (memoryStarters.has(roomId)) return true;
  return storageGet(`${STARTER_PREFIX}${roomId}`) === "1";
}

/** Старт партии. Запоминает браузер, чтобы финиш не посчитали с каждого экрана. */
export function trackGameStarted(params?: AnalyticsInput): void {
  if (isUuid(params?.room_id)) markStarter(params.room_id);
  track(YM_EVENTS.game_started, params);
}

/** Финиш — один раз и только там, где нажали «начать». */
export function trackGameFinished(params?: AnalyticsInput): void {
  const roomId = params?.room_id;
  if (!isUuid(roomId) || !isStarter(roomId)) return;
  trackOnce(YM_EVENTS.game_finished, roomId, params);
}

/** Кнопка QR на финальном экране. Подключить, когда она появится. */
export function trackFinalQrClick(params?: AnalyticsInput): void {
  track(YM_EVENTS.final_qr_click, params);
}

/** Кнопка «поделиться». format: stories | link | download. */
export function trackShareClick(
  format: ShareFormat,
  params?: AnalyticsInput,
): void {
  track(YM_EVENTS.share_click, { ...params, format });
}

/** 99 или 499 по коду тарифа. Чужое значение не отправляем. */
export function tariffRub(product: unknown): 99 | 499 | undefined {
  if (product !== "game" && product !== "month") return undefined;
  const price = PRODUCTS[product].priceRub;
  return price === 99 || price === 499 ? price : undefined;
}
