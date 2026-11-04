import type { Metadata } from "next";
import Link from "next/link";
import { DemoVideo } from "@/components/business/demo-video";
import { LeadForm } from "@/components/business/lead-form";
import { Logo } from "@/components/marks";
import {
  AUDIENCES,
  BUSINESS_DESCRIPTION,
  BUSINESS_FAQ,
  BUSINESS_FEATURES,
  BUSINESS_ON_REQUEST,
  BUSINESS_PATH,
  BUSINESS_STEPS,
  BUSINESS_TITLE,
} from "@/lib/b2b/content";
import { SITE_NAME, SITE_URL } from "@/lib/seo/site";

const URL = `${SITE_URL}${BUSINESS_PATH}`;

export const metadata: Metadata = {
  title: { absolute: BUSINESS_TITLE },
  description: BUSINESS_DESCRIPTION,
  alternates: { canonical: BUSINESS_PATH },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: BUSINESS_PATH,
    siteName: SITE_NAME,
    title: BUSINESS_TITLE,
    description: BUSINESS_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: BUSINESS_TITLE,
    description: BUSINESS_DESCRIPTION,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": `${URL}#webpage`,
      url: URL,
      name: BUSINESS_TITLE,
      description: BUSINESS_DESCRIPTION,
      inLanguage: "ru-RU",
      isPartOf: { "@id": `${SITE_URL}/#website` },
    },
    {
      "@type": "Service",
      "@id": `${URL}#service`,
      name: "Квиз для баров и корпоративов",
      serviceType: "Интерактивная викторина для мероприятий",
      description: BUSINESS_DESCRIPTION,
      url: URL,
      areaServed: { "@type": "Country", name: "Россия" },
      audience: [
        { "@type": "BusinessAudience", name: "Бары, рестораны, антикафе" },
        {
          "@type": "BusinessAudience",
          name: "Компании, HR и ивент-агентства",
        },
      ],
      provider: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    },
    {
      "@type": "FAQPage",
      "@id": `${URL}#faq`,
      mainEntity: BUSINESS_FAQ.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: { "@type": "Answer", text: item.answer },
      })),
    },
  ],
};

export default function BusinessPage() {
  return (
    <main className="biz">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <header className="biz-hero">
        <Link href="/" aria-label="Твояк — на главную">
          <Logo />
        </Link>
        <p className="logo-caption hand">для баров и корпоративов</p>
        <h1 className="biz-title hand">
          Квиз-вечер без ведущего в штате.
          <br />
          Табло на экране, ответы с телефонов.
        </h1>
        <p className="home-info-text">
          Твояк превращает любой экран в табло викторины: вопросы читает
          голосовой бот, гости отвечают со своих телефонов, ИИ проверяет ответы.
          Подходит для квиз-вечеров в баре, корпоративов и удалённых команд.
        </p>
        <div className="biz-cta">
          <a href="#lead" className="action">
            Оставить заявку
          </a>
          <a href="#demo" className="biz-link">
            ▶ Смотреть демо
          </a>
          <Link href="/" className="biz-link">
            Попробовать бесплатно →
          </Link>
        </div>
      </header>

      <div className="home-info">
        <section
          id="demo"
          className="home-info-block"
          aria-labelledby="demo-title"
        >
          <h2 id="demo-title" className="home-info-title hand">
            Как это выглядит
          </h2>
          <DemoVideo />
        </section>

        <section className="home-info-block" aria-labelledby="who-title">
          <h2 id="who-title" className="home-info-title hand">
            Кому подойдёт
          </h2>
          <div className="biz-audiences">
            {AUDIENCES.map((audience) => (
              <article key={audience.id} className="sheet biz-card">
                <span className="tape hand">{audience.tag}</span>
                <h3 className="home-step-title">{audience.title}</h3>
                <ul className="home-info-list biz-list">
                  {audience.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="home-info-block" aria-labelledby="how-title">
          <h2 id="how-title" className="home-info-title hand">
            Как это работает
          </h2>
          <ol className="home-steps">
            {BUSINESS_STEPS.map((step, index) => (
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

        <section className="home-info-block" aria-labelledby="features-title">
          <h2 id="features-title" className="home-info-title hand">
            Что внутри
          </h2>
          <ul className="home-info-list">
            {BUSINESS_FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <h3 className="home-step-title biz-sub">По запросу</h3>
          <div className="home-faq">
            {BUSINESS_ON_REQUEST.map((item) => (
              <div key={item.title} className="home-faq-item">
                <h4 className="home-faq-q">
                  {item.title} <span className="biz-badge">по запросу</span>
                </h4>
                <p className="home-info-text">{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="home-info-block" aria-labelledby="faq-title">
          <h2 id="faq-title" className="home-info-title hand">
            Частые вопросы
          </h2>
          <div className="home-faq">
            {BUSINESS_FAQ.map((item) => (
              <div key={item.question} className="home-faq-item">
                <h3 className="home-faq-q">{item.question}</h3>
                <p className="home-info-text">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="lead"
          className="home-info-block biz-lead"
          aria-labelledby="lead-title"
        >
          <h2 id="lead-title" className="home-info-title hand">
            Оставить заявку
          </h2>
          <p className="home-info-text">
            Расскажите о заведении или мероприятии — ответим и поможем провести
            первую игру.
          </p>
          <LeadForm />
        </section>
      </div>
    </main>
  );
}
