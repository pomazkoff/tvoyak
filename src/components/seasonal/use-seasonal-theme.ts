"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import {
  resolveSeasonalTheme,
  type SeasonalTheme,
} from "@/lib/seasonal/new-year";

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-season"],
  });
  return () => observer.disconnect();
}

function snapshot(): SeasonalTheme | null {
  return document.documentElement.dataset.season === "newyear"
    ? "newyear"
    : null;
}

function serverSnapshot(): SeasonalTheme | null {
  return null;
}

/**
 * Тема сезона. Адрес читается через useSearchParams, поэтому компонент
 * должен быть внутри Suspense. Календарь и data-season выставляются в
 * эффекте, не во время рендера: корень страницы остаётся статическим.
 */
export function useSeasonalTheme(): SeasonalTheme | null {
  const query = useSearchParams().get("theme");

  useLayoutEffect(() => {
    const next =
      resolveSeasonalTheme({
        now: new Date(),
        query,
        env: process.env.NEXT_PUBLIC_SEASONAL_THEME,
      }) ?? "off";
    if (document.documentElement.dataset.season !== next) {
      document.documentElement.dataset.season = next;
    }
  }, [query]);

  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
