import "server-only";

// ЮKassa — тот же подход, что в buro-etozhety (lib/payments.ts):
// одностадийный платёж (capture: true), redirect-подтверждение,
// ключ идемпотентности на каждую денежную операцию, вебхуку не верим —
// статус всегда перечитываем из API.

const API = "https://api.yookassa.ru/v3";

export type PaymentsMode = "off" | "test" | "live";

/** Явный режим, как в бюро: одних ключей мало, нужен PAYMENTS_MODE. */
export function paymentsMode(): PaymentsMode {
  if (!process.env.YOOKASSA_SHOP_ID || !process.env.YOOKASSA_SECRET_KEY)
    return "off";
  const mode = (process.env.PAYMENTS_MODE ?? "").trim().toLowerCase();
  return mode === "live" ? "live" : mode === "test" ? "test" : "off";
}

export function paymentsConfigured(): boolean {
  return Boolean(
    process.env.YOOKASSA_SHOP_ID && process.env.YOOKASSA_SECRET_KEY,
  );
}

export type YkStatus =
  "pending" | "waiting_for_capture" | "succeeded" | "canceled";

export type YkPayment = {
  id: string;
  status: YkStatus;
  paid: boolean;
  confirmationUrl?: string;
  test?: boolean;
  paymentRef?: string;
};

type RawPayment = {
  id: string;
  status: YkStatus;
  paid: boolean;
  confirmation?: { confirmation_url?: string };
  metadata?: { app?: string; payment_ref?: string };
  test?: boolean;
};

const PAYMENT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isYookassaId(value: unknown): value is string {
  return typeof value === "string" && PAYMENT_ID.test(value);
}

/**
 * Чек 54-ФЗ. В бюро чеки не передаются (самозанятый: ЮKassa сама
 * регистрирует доход в «Мой налог»). Для ИП/ООО с облачной кассой ЮKassa
 * включается YOOKASSA_RECEIPTS=1 — тогда чек уходит вместе с платежом.
 */
export function buildReceipt(input: {
  email: string;
  description: string;
  amountRub: number;
  vatCode?: number;
}) {
  return {
    customer: { email: input.email },
    items: [
      {
        description: input.description.slice(0, 128),
        quantity: "1.00",
        amount: { value: input.amountRub.toFixed(2), currency: "RUB" },
        vat_code: input.vatCode ?? 1,
        payment_mode: "full_payment",
        payment_subject: "service",
      },
    ],
  };
}

function auth(): string {
  const raw = `${process.env.YOOKASSA_SHOP_ID}:${process.env.YOOKASSA_SECRET_KEY}`;
  return `Basic ${Buffer.from(raw).toString("base64")}`;
}

async function call<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; idempotenceKey?: string },
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: init.method,
    headers: {
      authorization: auth(),
      "content-type": "application/json",
      ...(init.idempotenceKey
        ? { "Idempotence-Key": init.idempotenceKey }
        : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`yookassa ${init.method} ${path} → ${res.status}`);
  return JSON.parse(text) as T;
}

const shape = (p: RawPayment): YkPayment => ({
  id: p.id,
  status: p.status,
  paid: p.paid,
  confirmationUrl: p.confirmation?.confirmation_url,
  test: p.test,
  paymentRef: p.metadata?.payment_ref,
});

export async function createYkPayment(input: {
  paymentRef: string;
  amountRub: number;
  description: string;
  returnUrl: string;
  email?: string | null;
}): Promise<YkPayment> {
  const receipts = process.env.YOOKASSA_RECEIPTS?.trim() === "1";
  const vat = Number(process.env.YOOKASSA_VAT_CODE ?? "1");
  const raw = await call<RawPayment>("/payments", {
    method: "POST",
    idempotenceKey: input.paymentRef,
    body: {
      amount: { value: input.amountRub.toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: input.returnUrl },
      description: input.description.slice(0, 128),
      metadata: { app: "tvoyak", payment_ref: input.paymentRef },
      ...(receipts && input.email
        ? {
            receipt: buildReceipt({
              email: input.email,
              description: input.description,
              amountRub: input.amountRub,
              vatCode: Number.isInteger(vat) ? vat : 1,
            }),
          }
        : {}),
    },
  });
  return shape(raw);
}

export async function fetchYkPayment(id: string): Promise<YkPayment> {
  return shape(await call<RawPayment>(`/payments/${id}`, { method: "GET" }));
}
