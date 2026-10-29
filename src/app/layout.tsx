import type { Metadata, Viewport } from "next";
import { Manrope, Rubik_Spray_Paint, Unbounded } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-manrope",
});

const unbounded = Unbounded({
  subsets: ["cyrillic", "latin"],
  weight: ["300", "700"],
  display: "swap",
  variable: "--font-unbounded",
});

const spray = Rubik_Spray_Paint({
  subsets: ["cyrillic", "latin"],
  weight: "400",
  display: "swap",
  variable: "--font-spray",
});

export const metadata: Metadata = {
  title: "Твояк",
  description:
    "Своя игра для компании: ведущий на большом экране, игроки с телефонов.",
};

export const viewport: Viewport = {
  themeColor: "#e6e0d4",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${manrope.variable} ${unbounded.variable} ${spray.variable} h-full`}
    >
      <body
        className={`${manrope.className} flex min-h-full flex-col antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
