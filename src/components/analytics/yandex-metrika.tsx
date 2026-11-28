"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  rememberUtmTouch,
  ymCounterId,
  ymHit,
  ymInitSnippet,
} from "@/lib/analytics";

/**
 * Счётчик Метрики на всех страницах. Первый просмотр шлёт init,
 * дальше — hit на смену адреса. UTM запоминаем и без счётчика:
 * они нужны комнате и платежу, даже если NEXT_PUBLIC_YM_ID пуст.
 */
export function YandexMetrika() {
  const pathname = usePathname();
  const search = useSearchParams();
  const searchKey = search.toString();
  const firstHit = useRef(true);
  const id = ymCounterId();

  useEffect(() => {
    rememberUtmTouch(window.location.search);
    if (!id) return;
    if (firstHit.current) {
      firstHit.current = false;
      return;
    }
    ymHit(window.location.href, document.title);
  }, [pathname, searchKey, id]);

  if (!id) return null;
  const snippet = ymInitSnippet(id);
  if (!snippet) return null;
  return (
    <>
      <script
        id="yandex-metrika"
        dangerouslySetInnerHTML={{ __html: snippet }}
      />
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://mc.yandex.ru/watch/${id}`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
