export const FEEDBACK_MAX = 2000;
export const CONTACT_MAX = 200;

export type FeedbackInput = {
  text: string;
  contact: string;
  url: string;
  room: string | null;
  role: "host" | "player" | null;
  screen: string;
  errors: string[];
};

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function parseFeedback(
  body: unknown,
): { ok: true; value: FeedbackInput } | { ok: false; error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const raw = typeof b.text === "string" ? b.text.trim() : "";
  if (!raw) return { ok: false, error: "text_required" };
  if (raw.length > FEEDBACK_MAX) return { ok: false, error: "too_long" };
  const room = str(b.room, 8).toUpperCase();
  return {
    ok: true,
    value: {
      text: raw,
      contact: str(b.contact, CONTACT_MAX),
      url: str(b.url, 500),
      room: /^[A-Z0-9]{3,8}$/.test(room) ? room : null,
      role: b.role === "host" || b.role === "player" ? b.role : null,
      screen: str(b.screen, 40),
      errors: Array.isArray(b.errors)
        ? b.errors
            .slice(-5)
            .map((e) => str(e, 300))
            .filter(Boolean)
        : [],
    },
  };
}

export function moscowTime(now = new Date()): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(now);
}

export function feedbackMessage(
  f: FeedbackInput,
  extra: { username: string | null; userAgent: string; now?: Date },
): string {
  const lines = ["🐞 Баг", "", f.text, ""];
  if (f.contact) lines.push(`Контакт: ${f.contact}`);
  if (extra.username) lines.push(`Ведущий в Telegram: ${extra.username}`);
  if (f.url) lines.push(`Страница: ${f.url}`);
  if (f.room) lines.push(`Комната: ${f.room}`);
  if (f.role) lines.push(`Роль: ${f.role === "host" ? "ведущий" : "игрок"}`);
  lines.push(`Устройство: ${extra.userAgent.slice(0, 300) || "—"}`);
  if (f.screen) lines.push(`Экран: ${f.screen}`);
  lines.push(`Время (МСК): ${moscowTime(extra.now)}`);
  if (f.errors.length) {
    lines.push("", "Ошибки JS:");
    for (const e of f.errors) lines.push(`• ${e}`);
  }
  return lines.join("\n").slice(0, 4000);
}
