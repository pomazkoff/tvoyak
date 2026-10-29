const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_HOSTS = new Set([
  "commons.wikimedia.org",
  "upload.wikimedia.org",
]);

export function isQuestionId(value: string): boolean {
  return UUID.test(value);
}

/** Прокси ходит только на https и только к известным хостам картинок. */
export function isAllowedImageSource(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
