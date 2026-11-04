import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { PRODUCTS } from "./products";
import {
  describePromo,
  discountFor,
  normalizeCode,
  promoMessage,
} from "./promo";

describe("промокоды", () => {
  it("нормализует код как в бюро", () => {
    expect(normalizeCode(" tg kanal ")).toBe("TG-KANAL");
    expect(normalizeCode("Tg__Kanal")).toBe("TG-KANAL");
    expect(normalizeCode("x")).toBeNull();
    expect(normalizeCode("50%OFF")).toBeNull();
    expect(normalizeCode(42)).toBeNull();
  });
  it("скидка: проценты к рублю, не больше цены", () => {
    expect(discountFor("percent", 20, "game")).toBe(20);
    expect(discountFor("percent", 15, "month")).toBe(75);
    expect(discountFor("percent", 100, "month")).toBe(499);
    expect(discountFor("rub", 500, "game")).toBe(99);
  });
  it("цены в SQL совпадают с products.ts", () => {
    const sql = readFileSync(
      "supabase/migrations/20261104200000_promo_codes.sql",
      "utf8",
    );
    expect(sql).toContain(
      `WHEN 'game' THEN ${PRODUCTS.game.priceRub} ELSE ${PRODUCTS.month.priceRub} END`,
    );
  });
  it("описания по-русски", () => {
    expect(describePromo({ kind: "games", value: 3 })).toBe(
      "3 бесплатные партии",
    );
    expect(describePromo({ kind: "unlimited_days", value: 7 })).toBe(
      "безлимит на 7 дней",
    );
    expect(describePromo({ kind: "percent", value: 20, product: "game" })).toBe(
      "−20 % на партию",
    );
    expect(describePromo({ kind: "percent", value: 100 })).toBe("бесплатно");
    expect(promoMessage("promo_used")).toMatch(/уже/);
    expect(promoMessage("???")).toMatch(/Не получилось/);
  });
});
