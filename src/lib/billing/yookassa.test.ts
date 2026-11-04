import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("yookassa helpers", async () => {
  const { buildReceipt, isYookassaId, paymentsMode } =
    await import("./yookassa");
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
