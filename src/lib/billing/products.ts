/** Тарифы ведущего. Игроки не платят никогда. Общий файл для сервера и клиента. */
export type ProductId = "game" | "month";

export const PRODUCTS: Record<
  ProductId,
  { priceRub: number; title: string; description: string }
> = {
  game: {
    priceRub: 99,
    title: "Одна партия",
    description: "Твояк: одна партия для ведущего",
  },
  month: {
    priceRub: 499,
    title: "Безлимит на 30 дней",
    description: "Твояк: безлимит партий на 30 дней",
  },
};

export function isProductId(value: unknown): value is ProductId {
  return value === "game" || value === "month";
}

/** Ответы сервера, при которых показываем экран оплаты. */
export type PaywallError = "login_required" | "payment_required";

export function isPaywallError(value: unknown): value is PaywallError {
  return value === "login_required" || value === "payment_required";
}

export type Access =
  | { ok: true; kind: "free" | "credit" | "unlimited" }
  | { ok: false; error: PaywallError };

/**
 * Предварительная проверка «можно ли играть» — та же логика, что в
 * billing_consume (там она атомарная и окончательная).
 */
export function decideAccess(input: {
  loggedIn: boolean;
  credits: number;
  unlimitedUntil: string | null;
  freeUsedByDevice: boolean;
  freeUsedByUser: boolean;
  freeLimitByIp: boolean;
  now?: number;
}): Access {
  const now = input.now ?? Date.now();
  if (
    input.loggedIn &&
    input.unlimitedUntil &&
    Date.parse(input.unlimitedUntil) > now
  ) {
    return { ok: true, kind: "unlimited" };
  }
  if (
    !input.freeUsedByDevice &&
    !input.freeUsedByUser &&
    !input.freeLimitByIp
  ) {
    return { ok: true, kind: "free" };
  }
  if (input.loggedIn && input.credits > 0) return { ok: true, kind: "credit" };
  return {
    ok: false,
    error: input.loggedIn ? "payment_required" : "login_required",
  };
}

export function isDeviceId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{16,64}$/.test(value);
}
