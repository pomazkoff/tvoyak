/**
 * Цели Яндекс Метрики — имена «Джаваскрипт-событие».
 * final_qr_click и share_click кнопок ещё нет: константы и функции
 * готовы, их подключат в следующем PR.
 */
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

/** Ещё не навешаны на кнопки. */
export const YM_PENDING_EVENTS = {
  final_qr_click: YM_EVENTS.final_qr_click,
  share_click: YM_EVENTS.share_click,
} as const;

export const SHARE_FORMATS = ["stories", "link", "download"] as const;

export type ShareFormat = (typeof SHARE_FORMATS)[number];

const EVENT_SET = new Set<string>(Object.values(YM_EVENTS));

export function isYmEvent(value: string): value is YmEvent {
  return EVENT_SET.has(value);
}
