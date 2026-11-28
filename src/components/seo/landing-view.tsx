import Link from "next/link";
import { LeadForm } from "@/components/business/lead-form";
import { LegalFooter } from "@/components/legal-footer";
import { Logo } from "@/components/marks";
import { LandingLinks } from "@/components/seo/landing-links";
import { SeasonalLine } from "@/components/seasonal/seasonal-line";
import {
  hostTariffText,
  jsonLdScript,
  landingJsonLd,
  type LandingPage,
} from "@/lib/seo/landings";
import "./landing.css";

export function LandingView({ page }: { page: LandingPage }) {
  const jsonLd = landingJsonLd(page);
  return (
    <main className="biz seo-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <header className="biz-hero">
        <Link href="/" aria-label="Твояк — на главную">
          <Logo />
        </Link>
        <SeasonalLine className="seasonal-greet">С наступающим!</SeasonalLine>
        <p className="logo-caption hand">{page.kicker}</p>
        <h1 className="biz-title hand">
          {page.h1[0]}
          {page.h1.slice(1).map((line) => (
            <span key={line}>
              <br />
              {line}
            </span>
          ))}
        </h1>
        <p className="home-info-text">{page.lead}</p>
        <div className="biz-cta">
          <Link href="/" className="action">
            Создать комнату
          </Link>
          {page.inquiry ? (
            <a href="#lead" className="biz-link">
              Оставить заявку
            </a>
          ) : null}
        </div>
      </header>

      <div className="home-info">
        <section className="home-info-block" aria-labelledby="how-title">
          <h2 id="how-title" className="home-info-title hand">
            Как это работает
          </h2>
          <ol className="home-steps seo-steps">
            {page.steps.map((step, index) => (
              <li key={step.title} className="home-step sheet">
                <span className="home-step-num poster" aria-hidden>
                  {index + 1}
                </span>
                <h3 className="home-step-title">{step.title}</h3>
                <p className="home-info-text">{step.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="home-info-block" aria-labelledby="points-title">
          <h2 id="points-title" className="home-info-title hand">
            {page.pointsTitle}
          </h2>
          <ul className="home-info-list">
            {page.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
        </section>

        {page.remote ? (
          <section className="home-info-block" aria-labelledby="remote-title">
            <h2 id="remote-title" className="home-info-title hand">
              {page.remote.title}
            </h2>
            {page.remote.paragraphs.map((paragraph) => (
              <p key={paragraph} className="home-info-text seo-gap">
                {paragraph}
              </p>
            ))}
          </section>
        ) : null}

        {page.showTariffs ? (
          <section className="home-info-block" aria-labelledby="price-title">
            <h2 id="price-title" className="home-info-title hand">
              Сколько стоит
            </h2>
            <p className="home-info-text">{hostTariffText()}</p>
            <p className="home-info-text seo-gap">
              <Link href="/tarify" className="biz-link">
                Тарифы
              </Link>
              {" · "}
              <Link href="/oferta" className="biz-link">
                Публичная оферта
              </Link>
            </p>
          </section>
        ) : null}

        <section className="home-info-block" aria-labelledby="faq-title">
          <h2 id="faq-title" className="home-info-title hand">
            Частые вопросы
          </h2>
          <div className="home-faq">
            {page.faq.map((item) => (
              <div key={item.question} className="home-faq-item">
                <h3 className="home-faq-q">{item.question}</h3>
                <p className="home-info-text">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        {page.inquiry ? (
          <section
            id="lead"
            className="home-info-block biz-lead"
            aria-labelledby="lead-title"
          >
            <h2 id="lead-title" className="home-info-title hand">
              {page.inquiry.title}
            </h2>
            <p className="home-info-text">
              {page.inquiry.text}{" "}
              <Link href="/business" className="biz-link">
                Твояк для баров и корпоративов
              </Link>
              .
            </p>
            <LeadForm />
          </section>
        ) : null}

        <section className="home-info-block" aria-labelledby="create-title">
          <h2 id="create-title" className="home-info-title hand">
            Собрать комнату
          </h2>
          <p className="home-info-text">{page.close}</p>
          <div className="biz-cta">
            <Link href="/" className="action">
              Создать комнату
            </Link>
          </div>
        </section>

        <nav className="home-info-block" aria-label="Другие подборки">
          <p className="home-info-more">
            <LandingLinks except={page.path} className="biz-link" />
          </p>
        </nav>
      </div>
      <LegalFooter />
    </main>
  );
}
