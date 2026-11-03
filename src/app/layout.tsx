import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Golos_Text,
  JetBrains_Mono,
  Oswald,
  Sofia_Sans_Extra_Condensed,
} from "next/font/google";
import { RoughDefs } from "@/components/marks";
import {
  OG_DESCRIPTION,
  OG_TITLE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
} from "@/lib/seo/site";
import "./globals.css";

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
    >
      <body
        className={`${golos.className} flex min-h-full flex-col antialiased`}
      >
        <RoughDefs />
        {children}
      </body>
    </html>
  );
}
