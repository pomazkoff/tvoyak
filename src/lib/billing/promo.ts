/**
 * Промокоды ведущего — как в бюро: код — ярлык канала, регистр и пробелы не
 * важны. Проверка и применение атомарно в SQL (promo_apply), здесь — форма
 * кода и тексты для экрана. Общий файл для сервера и клиента.
 */
import { PRODUCTS, type ProductId } from "./products";

export type PromoKind = "percent" | "rub" | "games" | "unlimited_days";

export type PromoFail =
  | "promo_not_found"
  | "promo_not_started"
  | "promo_expired"
  | "promo_exhausted"
  | "promo_used"
  | "promo_wrong_product"
  | "promo_rate_limited"
  | "login_required";

export type PromoResult =
  | { ok: false; reason: PromoFail | string }
  | {
      ok: true;
      kind: PromoKind;
      value: number;
      product?: ProductId | null;
      granted?: boolean;
      payment_id?: string;
      price_rub?: number;
      discount_rub?: number;
    };

/** «tg kanal», «Tg_Kanal» и «TG-KANAL» — один код. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
  return /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/.test(code) ? code : null;
}

/** Та же формула, что в promo_apply: проценты к ближайшему рублю, не больше цены. */
export function discountFor(
  kind: "percent" | "rub",
  value: number,
  product: ProductId,
): number {
  const base = PRODUCTS[product].priceRub;
  const d = kind === "percent" ? Math.round((base * value) / 100) : value;
  return Math.max(0, Math.min(base, d));
}

export const PROMO_MESSAGES: Record<PromoFail, string> = {
  promo_not_found: "Такого промокода нет.",
  promo_not_started: "Промокод ещё не начал действовать.",
  promo_expired: "Срок промокода истёк.",
  promo_exhausted: "Промокод закончился.",
  promo_used: "Вы уже использовали этот промокод.",
  promo_wrong_product: "Этот промокод действует на другой тариф.",
  promo_rate_limited: "Слишком много попыток. Попробуйте через 10 минут.",
  login_required: "Войдите, чтобы применить промокод.",
};

export function promoMessage(reason: string): string {
  return (
    PROMO_MESSAGES[reason as PromoFail] ?? "Не получилось применить промокод."
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «−20 % на партию», «3 бесплатные партии», «безлимит на 7 дней». */
export function describePromo(r: {
  kind: PromoKind;
  value: number;
  product?: ProductId | null;
}): string {
  const target = r.product
    ? r.product === "game"
      ? " на партию"
      : " на безлимит"
    : "";
  switch (r.kind) {
    case "percent":
      return r.value >= 100 ? `бесплатно${target}` : `−${r.value} %${target}`;
    case "rub":
      return `−${r.value} ₽${target}`;
    case "games":
      return `${r.value} ${plural(r.value, "бесплатная партия", "бесплатные партии", "бесплатных партий")}`;
    case "unlimited_days":
      return `безлимит на ${r.value} ${plural(r.value, "день", "дня", "дней")}`;
  }
}
