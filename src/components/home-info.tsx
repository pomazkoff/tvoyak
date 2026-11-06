import Link from "next/link";
import { HOME_FAQ } from "@/lib/seo/site";

const STEPS = [
  {
    title: "Откройте табло",
    text: "На телевизоре или ноутбуке нажмите «Создать комнату» и выберите ведущего: живого человека или голосового бота.",
  },
  {
    title: "Подключите телефоны",
    text: "Игроки сканируют QR-код с табло или вводят четыре буквы кода комнаты. Ничего устанавливать не нужно — хватит браузера.",
  },
  {
    title: "Играйте",
    text: "Два раунда по шесть тем и финал. Отвечайте с телефона: ИИ проверяет ответы по смыслу, а очки сразу видны на табло.",
  },
];

const FEATURES = [
  "Около 5000 вопросов, включая свежие и трендовые темы",
  "Превью треков в музыкальных вопросах и встроенные ролики с YouTube или VK",
  "Задания с картинками: ребусы, эмодзи-шифры, логотипы, детские рисунки",
  "Голосовой ведущий-бот или живой ведущий с пультом на телефоне",
];

/** Текст под первым экраном главной: что это, как играть, FAQ. */
export function HomeInfo() {
  return (
    <div className="home-info">
      <section className="home-info-block" aria-labelledby="about-title">
        <h2 id="about-title" className="home-info-title hand">
          Что такое Твояк
        </h2>
        <p className="home-info-text">
          Твояк — бесплатная викторина для друзей прямо в браузере. Табло
          открывается на телевизоре или ноутбуке, игроки подключаются с
          телефонов по QR-коду или коду комнаты, без установки приложений. Вести
          игру может голосовой бот или живой ведущий, а ответы проверяет ИИ — по
          смыслу, а не по буквам.
        </p>
        <ul className="home-info-list">
          {FEATURES.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>

      <section className="home-info-block" aria-labelledby="how-title">
        <h2 id="how-title" className="home-info-title hand">
          Как играть
        </h2>
        <ol className="home-steps">
          {STEPS.map((step, index) => (
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

      <section className="home-info-block" aria-labelledby="faq-title">
        <h2 id="faq-title" className="home-info-title hand">
          Частые вопросы
        </h2>
        <div className="home-faq">
          {HOME_FAQ.map((item) => (
            <div key={item.question} className="home-faq-item">
              <h3 className="home-faq-q">{item.question}</h3>
              <p className="home-info-text">{item.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="home-info-block">
        <p className="home-info-more">
          Проводите квизы в баре или на корпоративе?{" "}
          <Link href="/business" className="biz-link">
            Твояк для баров и корпоративов →
          </Link>
        </p>
      </footer>
    </div>
  );
}
