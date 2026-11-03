/**
 * IP клиента для лимитов. За своим обратным прокси (VPS с nginx перед
 * Vercel) Vercel перезаписывает X-Forwarded-For адресом прокси, и все
 * игроки выглядели бы одним IP. Поэтому прокси шлёт настоящий адрес в
 * X-Edge-Client-IP вместе с секретом X-Edge-Secret; заголовку верим только
 * при совпадении секрета с EDGE_PROXY_SECRET. Без переменной — как раньше.
 */
export function clientIp(
  headers: Headers,
  secret: string | undefined = process.env.EDGE_PROXY_SECRET,
): string {
  if (secret && headers.get("x-edge-secret") === secret) {
    const edgeIp = headers.get("x-edge-client-ip")?.trim();
    if (edgeIp) return edgeIp;
  }
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}
