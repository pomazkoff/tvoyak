import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Golos_Text,
  JetBrains_Mono,
  Oswald,
  Sofia_Sans_Extra_Condensed,
} from "next/font/google";
import { BugReport } from "@/components/feedback/bug-report";
import { VkPixel } from "@/components/analytics/vk-pixel";
import { YandexMetrika } from "@/components/analytics/yandex-metrika";
import { RoughDefs } from "@/components/marks";
import { Garland } from "@/components/seasonal/garland";
import { SeasonalRoot } from "@/components/seasonal/seasonal-root";
import { seasonalBootScript } from "@/lib/seasonal/new-year";
import {
  OG_DESCRIPTION,
  OG_TITLE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/seo/site";
import "./globals.css";
import "@/components/seasonal/seasonal.css";

const golos = Golos_Text({
  subsets: ["cyrillic", "latin"],
  weight: ["500", "600"],
  display: "swap",
  variable: "--font-golos",
});

const sofia = Sofia_Sans_Extra_Condensed({
  subsets: ["cyrillic", "latin"],
  weight: ["800", "900"],
  display: "swap",
  variable: "--font-sofia",
});

const caveat = Caveat({
  subsets: ["cyrillic", "latin"],
  weight: "700",
  display: "swap",
  variable: "--font-caveat",
});

const oswald = Oswald({
  subsets: ["cyrillic", "latin"],
  weight: "700",
  display: "swap",
  variable: "--font-oswald",
  // Только запасной шрифт логотипа: в preload не нужен.
  preload: false,
});

const mono = JetBrains_Mono({
  subsets: ["cyrillic", "latin"],
  weight: "500",
  display: "swap",
  variable: "--font-jetbrains",
  // Моноширинный нужен только в поле кода и на игровых экранах.
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#ECEAE4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${golos.variable} ${sofia.variable} ${caveat.variable} ${oswald.variable} ${mono.variable} h-full`}
      suppressHydrationWarning
    >
      <body
        className={`${golos.className} flex min-h-full flex-col antialiased`}
      >
        <script
          dangerouslySetInnerHTML={{
            __html: seasonalBootScript(process.env.NEXT_PUBLIC_SEASONAL_THEME),
          }}
        />
        <RoughDefs />
        {children}
        <Garland />
        <Suspense fallback={null}>
          <SeasonalRoot />
        </Suspense>
        <Suspense fallback={null}>
          <BugReport />
          <VkPixel />
          <YandexMetrika />
        </Suspense>
      </body>
    </html>
  );
}
