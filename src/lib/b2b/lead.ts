/**
 * Заявка с B2B-лендинга /business: проверка полей на сервере и текст
 * уведомления. Без зависимостей — тестируется отдельно от роута.
 */

export const LEAD_TYPES = ["bar", "corporate", "agency", "other"] as const;
export type LeadType = (typeof LEAD_TYPES)[number];

export const LEAD_TYPE_LABEL: Record<LeadType, string> = {
  bar: "Бар, ресторан, антикафе",
  corporate: "Компания: корпоратив, тимбилдинг",
  agency: "Ивент-агентство",
  other: "Другое",
};

export const LEAD_LIMITS = {
  name: 80,
  company: 120,
  contact: 120,
  comment: 1500,
} as const;

export type Lead = {
  name: string;
  company: string;
  type: LeadType;
  contact: string;
  eventDate: string | null;
  comment: string | null;
};

export type LeadParse =
  | { ok: true; lead: Lead }
  | { ok: false; error: LeadError; field?: keyof Lead }
  /** Заполнено поле-ловушка: бот. Отвечаем «ок», но не сохраняем. */
  | { ok: "spam" };

export type LeadError =
  "required" | "too_long" | "bad_type" | "bad_contact" | "bad_date";

/** Поле-ловушка: скрыто от людей, боты его заполняют. */
export const HONEYPOT_FIELD = "website";

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function multiline(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+/g, " ")
        .trim()
    : "";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TELEGRAM = /^(@|https?:\/\/t\.me\/|t\.me\/)[a-z0-9_]{4,32}$/i;

/** Телефон (от 10 цифр), Telegram (@ник или t.me/ник) или почта. */
export function isContact(value: string): boolean {
  if (EMAIL.test(value)) return true;
  if (TELEGRAM.test(value)) return true;
  const digits = value.replace(/\D/g, "");
  return (
    /^[+\d\s()\-.]+$/.test(value) && digits.length >= 10 && digits.length <= 15
  );
}

/** Дата мероприятия: ГГГГ-ММ-ДД из <input type="date">, необязательна. */
function parseDate(value: string): string | null | false {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)
    return false;
  return value;
}

export function parseLead(body: unknown): LeadParse {
  const input = (body && typeof body === "object" ? body : {}) as Record<
    string,
    unknown
  >;
  if (text(input[HONEYPOT_FIELD])) return { ok: "spam" };

  const name = text(input.name);
  const company = text(input.company);
  const contact = text(input.contact);
  const comment = multiline(input.comment);
  const type = text(input.type);

  if (!name) return { ok: false, error: "required", field: "name" };
  if (name.length > LEAD_LIMITS.name)
    return { ok: false, error: "too_long", field: "name" };
  if (!company) return { ok: false, error: "required", field: "company" };
  if (company.length > LEAD_LIMITS.company)
    return { ok: false, error: "too_long", field: "company" };
  if (!(LEAD_TYPES as readonly string[]).includes(type))
    return { ok: false, error: "bad_type", field: "type" };
  if (!contact) return { ok: false, error: "required", field: "contact" };
  if (contact.length > LEAD_LIMITS.contact || !isContact(contact))
    return { ok: false, error: "bad_contact", field: "contact" };
  if (comment.length > LEAD_LIMITS.comment)
    return { ok: false, error: "too_long", field: "comment" };
  const eventDate = parseDate(text(input.eventDate));
  if (eventDate === false)
    return { ok: false, error: "bad_date", field: "eventDate" };

  return {
    ok: true,
    lead: {
      name,
      company,
      type: type as LeadType,
      contact,
      eventDate,
      comment: comment || null,
    },
  };
}

/** Текст уведомления в Telegram (обычный текст, без разметки). */
export function leadMessage(lead: Lead): string {
  return [
    "Новая заявка с tvoyak.ru/business",
    `Имя: ${lead.name}`,
    `Компания: ${lead.company}`,
    `Тип: ${LEAD_TYPE_LABEL[lead.type]}`,
    `Контакт: ${lead.contact}`,
    lead.eventDate ? `Дата: ${lead.eventDate}` : null,
    lead.comment ? `Комментарий: ${lead.comment}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Ошибка для человека — по-русски, рядом с формой. */
export function leadErrorText(error: string, field?: string): string {
  if (error === "rate_limited")
    return "Слишком много заявок подряд. Попробуйте через несколько минут.";
  if (error === "bad_contact")
    return "Укажите телефон, Telegram (@ник) или почту.";
  if (error === "bad_date") return "Проверьте дату мероприятия.";
  if (error === "bad_type") return "Выберите, кто вы.";
  if (error === "too_long") return "Слишком длинный текст в одном из полей.";
  if (error === "required") {
    if (field === "name") return "Как к вам обращаться?";
    if (field === "company") return "Укажите заведение или компанию.";
    return "Заполните обязательные поля.";
  }
  return "Не получилось отправить. Попробуйте ещё раз или чуть позже.";
}
