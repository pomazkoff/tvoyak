import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./globals.css";

const onest = Onest({
  subsets: ["cyrillic", "latin"],
  display: "swap",
  variable: "--font-onest",
});

export const metadata: Metadata = {
  title: "Твояк",
  description:
    "Своя игра для компании: ведущий на большом экране, игроки с телефонов.",
};

export const viewport: Viewport = {
  themeColor: "#07111f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ru" className={`${onest.variable} h-full`}>
      <body
        className={`${onest.className} flex min-h-full flex-col antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
