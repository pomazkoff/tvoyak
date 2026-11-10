/**
 * Реквизиты исполнителя и ссылки на юридические страницы.
 * Исполнитель тот же, что на etozhety.ru: Помазков Илья, самозанятый.
 * Цены сюда не дублируются — их источник src/lib/billing/products.ts.
 */

export const SELLER = {
  name: "Помазков Илья",
  inn: "550415525096",
  address: "г. Москва, ул. Садовая-Кудринская, д. 32",
  email: "privet@etozhety.ru",
} as const;

export const LEGAL_EDITION = "10.11.2026";

export const LEGAL_LINKS = [
  { href: "/oferta", label: "Публичная оферта" },
  {
    href: "/privacy",
    label: "Политика в отношении обработки персональных данных",
  },
  { href: "/consent", label: "Согласие на обработку персональных данных" },
] as const;

export const LEGAL_PATHS = LEGAL_LINKS.map((link) => link.href);
