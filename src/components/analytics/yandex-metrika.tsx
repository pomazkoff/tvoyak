"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  bootYandexMetrika,
  listenForGoalEvents,
  rememberUtmTouch,
  ymCounterId,
  ymHit,
} from "@/lib/analytics";

/**
 * Счётчик Метрики на всех страницах. Скрипт ставится в браузере и только
 * на проде tvoyak.ru: так превью и localhost не попадают в отчёт.
 * Первый просмотр шлёт init, дальше — hit на смену адреса.
 * UTM запоминаем и без счётчика: они нужны комнате и платежу.
 */
export function YandexMetrika() {
  const pathname = usePathname();
  const search = useSearchParams();
  const searchKey = search.toString();
  const firstHit = useRef(true);

  useEffect(() => {
    listenForGoalEvents();
    rememberUtmTouch(window.location.search);
    const id = ymCounterId();
    if (!id) return;
    bootYandexMetrika(id);
    if (firstHit.current) {
      firstHit.current = false;
      return;
    }
    ymHit(window.location.href, document.title);
  }, [pathname, searchKey]);

  return null;
}
