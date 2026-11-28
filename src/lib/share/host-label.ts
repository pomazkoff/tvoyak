/**
 * Публичная подпись ведущего на финале: «Вас приглашает Илья».
 * В ссылки не попадает. Почту и фамилию не храним.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK = /https?:|www\./i;
const MAX = 40;

function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || EMAIL.test(text) || LINK.test(text)) return null;
  return Array.from(text).slice(0, MAX).join("");
}

/** Первое слово полного имени, если оно само по себе читается как имя. */
function givenName(full: string): string {
  const parts = full.split(" ");
  if (parts.length < 2) return full;
  const first = parts[0] ?? "";
  return Array.from(first).length >= 2 ? first : full;
}

export function hostLabelFromMeta(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta) return null;
  const full = clean(meta.full_name) ?? clean(meta.name);
  if (full) {
    const name = givenName(full);
    return Array.from(name).length >= 2 ? name : null;
  }
  const handle = clean(meta.telegram_username)?.replace(/^@+/, "") ?? "";
  if (Array.from(handle).length < 2 || EMAIL.test(handle)) return null;
  return Array.from(handle).slice(0, MAX).join("");
}

export function hostLabelFromUser(
  user: { user_metadata?: Record<string, unknown> | null } | null,
): string | null {
  if (!user) return null;
  return hostLabelFromMeta(user.user_metadata ?? undefined);
}

/** Подпись на финале. Без имени — null, отдельной фразы нет. */
export function inviteCaption(label: string | null | undefined): string | null {
  const name = hostLabelFromMeta({ full_name: label ?? "" });
  if (!name) return null;
  return `Вас приглашает ${name} — первая партия бесплатно`;
}
