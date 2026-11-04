import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("yookassa helpers", async () => {
  const { buildReceipt, createYkPayment, isYookassaId, paymentsMode } =
    await import("./yookassa");
  it("платёж помечен metadata.app = tvoyak (общий магазин с бюро)", async () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "1");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "k");
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "2f9d1c3a-000f-5000-9000-1b2c3d4e5f60",
        status: "pending",
        paid: false,
        amount: { value: "99.00" },
        confirmation: { confirmation_url: "https://y" },
        metadata: {},
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await createYkPayment({
      paymentRef: "r1",
      amountRub: 99,
      description: "Партия",
      returnUrl: "https://t",
    }).catch(() => null);
    const init = (
      fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    )[1];
    expect(JSON.parse(String(init.body)).metadata).toEqual({
      app: "tvoyak",
      payment_ref: "r1",
    });
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  it("id платежа — только формат ЮKassa", () => {
    expect(isYookassaId("2f9d1c3a-000f-5000-9000-1b2c3d4e5f60")).toBe(true);
    expect(isYookassaId("../payments")).toBe(false);
  });
  it("чек 54-ФЗ: услуга, полная оплата, сумма строкой", () => {
    const r = buildReceipt({
      email: "a@b.ru",
      description: "Партия",
      amountRub: 99,
    });
    expect(r.items[0]).toMatchObject({
      quantity: "1.00",
      amount: { value: "99.00", currency: "RUB" },
      payment_subject: "service",
      payment_mode: "full_payment",
      vat_code: 1,
    });
  });
  it("без ключей оплата выключена", () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "");
    vi.stubEnv("PAYMENTS_MODE", "live");
    expect(paymentsMode()).toBe("off");
    vi.unstubAllEnvs();
  });
});
