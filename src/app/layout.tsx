import type { Metadata, Viewport } from "next";
import { Literata, Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-manrope",
});

const literata = Literata({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-literata",
});

export const metadata: Metadata = {
  title: "Твояк",
  description:
    "Своя игра для компании: ведущий на большом экране, игроки с телефонов.",
};

export const viewport: Viewport = {
  themeColor: "#070707",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${manrope.variable} ${literata.variable} h-full`}>
      <body className={`${manrope.className} flex min-h-full flex-col antialiased`}>
        {children}
      </body>
    </html>
  );
}
