import type { Metadata } from "next";
import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";
import { Logo } from "@/components/marks";
import { payPath, PRODUCTS, type ProductId } from "@/lib/billing/products";
import { SELLER } from "@/lib/legal";
import { SITE_NAME } from "@/lib/seo/site";

const PATH = "/tarify";
const TITLE = "Тарифы Твояка";

const game = PRODUCTS.game;
const month = PRODUCTS.month;

const DESCRIPTION = `Каталог услуг ведущего: «${game.title}» — ${game.priceRub} ₽, «${month.title}» — ${month.priceRub} ₽. Платит только ведущий, игроки подключаются бесплатно. Первая партия бесплатно.`;

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: PATH },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    url: PATH,
    title: TITLE,
    description: DESCRIPTION,
  },
};

/** Что входит и срок. Цены только из PRODUCTS, без «от». */
const DETAILS: Record<ProductId, { points: string[]; term: string }> = {
  game: {
    points: ["Одна партия для ведущего", "Игроки подключаются бесплатно"],
    term: "Доступ открывается сразу после оплаты.",
  },
  month: {
    points: [
      "Любое число партий ведущего в течение срока",
      "Игроки подключаются бесплатно",
    ],
    term: "Доступ открывается сразу после оплаты. Безлимит действует 30 дней.",
  },
};

const ORDER: ProductId[] = ["game", "month"];

export default function TarifyPage() {
  return (
    <main>
      <div className="tarify-page">
        <Link href="/" aria-label="Твояк — на главную" className="tarify-logo">
          <Logo compact />
        </Link>
        <h1>{TITLE}</h1>
        <p className="tarify-lead">
          Платит только ведущий. Игроки подключаются бесплатно. Первая партия
          бесплатно — на условиях <Link href="/oferta">публичной оферты</Link>.
        </p>
        <div className="tarify-grid">
          {ORDER.map((id) => {
            const item = PRODUCTS[id];
            const details = DETAILS[id];
            return (
              <article key={id} className="sheet tarify-card">
                <h2>{item.title}</h2>
                <p className="tarify-price">{item.priceRub} ₽</p>
                <h3>Что входит</h3>
                <ul>
                  {details.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <h3>Срок</h3>
                <p className="tarify-term">{details.term}</p>
                <Link href={payPath(id)} className="action">
                  Купить
                </Link>
              </article>
            );
          })}
        </div>
        <section className="tarify-notes" aria-labelledby="tarify-pay-title">
          <h2 id="tarify-pay-title">Оплата и возврат</h2>
          <p>Способ оплаты — онлайн через ЮKassa.</p>
          <p>
            Возврат уплаченной суммы — по условиям{" "}
            <Link href="/oferta">публичной оферты</Link>.
          </p>
          <p>
            Контакт: <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
          </p>
        </section>
      </div>
      <LegalFooter />
    </main>
  );
}
