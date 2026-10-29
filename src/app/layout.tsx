import type { Metadata, Viewport } from "next";
import {
  Caveat,
  Golos_Text,
  JetBrains_Mono,
  Oswald,
  Sofia_Sans_Extra_Condensed,
} from "next/font/google";
import { RoughDefs } from "@/components/marks";
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
});

const mono = JetBrains_Mono({
  subsets: ["cyrillic", "latin"],
  weight: "500",
  display: "swap",
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Твояк",
  description:
    "Своя игра для компании: ведущий на большом экране, игроки с телефонов.",
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
