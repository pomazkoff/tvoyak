import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/billing/products";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { SITE_URL } from "@/lib/seo/site";
import {
  LANDINGS,
  forbiddenMentions,
  hostTariffText,
  jsonLdScript,
  landingHeadline,
  landingJsonLd,
} from "@/lib/seo/landings";

const RUBLES = new Set([PRODUCTS.game.priceRub, PRODUCTS.month.priceRub]);

function pageBlob(page: (typeof LANDINGS)[number]): string {
  return JSON.stringify({
    page,
    headline: landingHeadline(page),
    tariff: hostTariffText(),
    jsonLd: landingJsonLd(page),
  });
}

describe("SEO-посадочные", () => {
  it("у каждой страницы свои title, description, h1 и путь", () => {
    const titles = LANDINGS.map((page) => page.title);
    const descriptions = LANDINGS.map((page) => page.description);
    const headlines = LANDINGS.map((page) => landingHeadline(page));
    const paths = LANDINGS.map((page) => page.path);
    expect(new Set(titles).size).toBe(LANDINGS.length);
    expect(new Set(descriptions).size).toBe(LANDINGS.length);
    expect(new Set(headlines).size).toBe(LANDINGS.length);
    expect(new Set(paths).size).toBe(LANDINGS.length);
    for (const page of LANDINGS) {
      expect(page.title.length).toBeGreaterThan(20);
      expect(page.title.length).toBeLessThanOrEqual(70);
      expect(page.description.length).toBeGreaterThan(80);
      expect(page.description.length).toBeLessThanOrEqual(200);
      expect(page.ogTitle.length).toBeGreaterThan(10);
      expect(page.ogDescription.length).toBeGreaterThan(40);
      expect(page.h1.length).toBeGreaterThan(0);
      expect(page.steps.length).toBeGreaterThanOrEqual(3);
      expect(page.steps.length).toBeLessThanOrEqual(4);
      expect(page.faq.length).toBeGreaterThanOrEqual(4);
      expect(page.faq.length).toBeLessThanOrEqual(6);
    }
  });

  it("JSON-LD — валидный FAQPage, ответы совпадают с видимым FAQ", () => {
    for (const page of LANDINGS) {
      const data = landingJsonLd(page);
      const raw = jsonLdScript(data);
      expect(raw).not.toContain("<");
      const parsed = JSON.parse(raw) as typeof data;
      expect(parsed["@context"]).toBe("https://schema.org");
      expect(parsed["@graph"]).toHaveLength(2);

      const [webpage, faq] = parsed["@graph"];
      const url = `${SITE_URL}${page.path}`;
      expect(webpage).toMatchObject({
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: page.title,
        headline: landingHeadline(page),
        description: page.description,
        inLanguage: "ru-RU",
      });
      expect(faq).toMatchObject({
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        url,
        inLanguage: "ru-RU",
      });
      const entities = faq.mainEntity ?? [];
      expect(entities).toHaveLength(page.faq.length);
      entities.forEach((entity, index) => {
        expect(entity).toEqual({
          "@type": "Question",
          name: page.faq[index]?.question,
          acceptedAnswer: {
            "@type": "Answer",
            text: page.faq[index]?.answer,
          },
        });
        expect(entity.name.trim().length).toBeGreaterThan(0);
        expect(entity.acceptedAnswer.text.trim().length).toBeGreaterThan(0);
      });
      const questions = page.faq.map((item) => item.question);
      expect(new Set(questions).size).toBe(questions.length);
    }
  });

  it("экранирует < так, что JSON-LD всё ещё разбирается", () => {
    const raw = jsonLdScript({ "@type": "Answer", text: "1 < 2" });
    expect(raw).toContain("\\u003c");
    expect(raw).not.toContain("<");
    expect(JSON.parse(raw)).toEqual({ "@type": "Answer", text: "1 < 2" });
  });

  it("не зовёт чужие викторины и не выдумывает цены", () => {
    for (const page of LANDINGS) {
      const blob = pageBlob(page);
      expect(forbiddenMentions(blob)).toEqual([]);
      const amounts = [...blob.matchAll(/(\d+)\s*₽/g)].map((match) =>
        Number(match[1]),
      );
      expect(amounts.length).toBeGreaterThan(0);
      for (const amount of amounts) expect(RUBLES.has(amount)).toBe(true);
      expect(blob).not.toMatch(/навсегда|успей|только сегодня|не упустите/i);
      expect(blob).not.toMatch(/app store|google play|скачать приложение/i);
    }
    expect(hostTariffText()).toContain(`${PRODUCTS.game.priceRub} ₽`);
    expect(hostTariffText()).toContain(`${PRODUCTS.month.priceRub} ₽`);
  });

  it("говорит про десять игроков и не обещает другой лимит", () => {
    for (const page of LANDINGS) {
      const blob = pageBlob(page);
      expect(blob.toLowerCase()).toMatch(/десяти|10 игроков/);
      const caps = [...blob.matchAll(/до (\d+)/gi)].map((match) =>
        Number(match[1]),
      );
      expect(caps.every((cap) => cap === 10)).toBe(true);
    }
  });

  it("страницы есть в sitemap, robots указывает на sitemap.xml", () => {
    const urls = sitemap().map((entry) => entry.url);
    for (const page of LANDINGS) {
      const url = `${SITE_URL}${page.path}`;
      expect(urls.filter((item) => item === url)).toEqual([url]);
      const entry = sitemap().find((item) => item.url === url);
      expect(entry?.priority).toBe(0.8);
      expect(entry?.changeFrequency).toBe("weekly");
    }
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
});
