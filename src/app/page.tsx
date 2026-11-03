import type { Metadata } from "next";
import { HomeInfo } from "@/components/home-info";
import { HomeScreen } from "@/components/home-screen";
import {
  HOME_FAQ,
  OG_DESCRIPTION,
  OG_TITLE,
  SITE_NAME,
  SITE_URL,
} from "@/lib/seo/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    url: "/",
    title: OG_TITLE,
    description: OG_DESCRIPTION,
  },
};

/** Без offers и цены: ограничение владельца. FAQ совпадает с видимым на странице. */
const JSON_LD = [
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    inLanguage: "ru",
  },
  {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    url: `${SITE_URL}/`,
    applicationCategory: "GameApplication",
    operatingSystem: "Любой современный браузер",
    browserRequirements: "Нужен современный браузер и интернет",
    inLanguage: "ru",
    description:
      "Браузерная викторина для компании: табло на телевизоре или ноутбуке, игроки отвечают с телефонов по QR-коду или коду комнаты. Голосовой бот или живой ведущий, ИИ проверяет ответы по смыслу.",
    featureList: [
      "Табло на телевизоре или ноутбуке, ответы с телефонов",
      "Подключение по QR-коду или коду комнаты без установки",
      "Голосовой ведущий-бот или живой ведущий",
      "Проверка ответов по смыслу с помощью ИИ",
      "Два раунда по шесть тем и финал",
      "Около 5000 вопросов, музыкальные превью, встроенные видео с YouTube или VK и задания с картинками",
    ],
    author: { "@type": "Person", name: "Илья Помазков" },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: HOME_FAQ.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  },
];

export default function HomePage() {
  return (
    <main>
      <HomeScreen />
      <HomeInfo />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c"),
        }}
      />
    </main>
  );
}
