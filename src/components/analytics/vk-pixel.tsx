"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { rememberUtm, VK_PIXEL_ID, vkPageView } from "@/lib/analytics/vk-pixel";

/** Счётчик VK Рекламы: грузится после интерактива, считает SPA-переходы. */
export function VkPixel() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    rememberUtm(window.location.search);
    if (!VK_PIXEL_ID) return;
    // Первый просмотр отправляет сам сниппет; дальше — клиентские переходы.
    if (first.current) {
      first.current = false;
      vkPageView();
      return;
    }
    vkPageView(window.location.href);
  }, [pathname]);

  if (!VK_PIXEL_ID) return null;
  return (
    <>
      <Script
        id="vk-pixel"
        src="https://top-fwz1.mail.ru/js/code.js"
        strategy="afterInteractive"
      />
      <noscript>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`https://top-fwz1.mail.ru/counter?id=${encodeURIComponent(VK_PIXEL_ID)};js=na`}
            style={{ position: "absolute", left: "-9999px" }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
