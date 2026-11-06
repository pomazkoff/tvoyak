import "server-only";

/**
 * Флаг оплаты. Без PAYWALL_ENABLED=1 всё бесплатно, как раньше:
 * комнаты не привязываются к плательщику, старт ничего не списывает.
 */
export function paywallEnabled(): boolean {
  return process.env.PAYWALL_ENABLED?.trim() === "1";
}
