import { describe, expect, it } from "vitest";
import { parsePrice, priceWithinTolerance } from "@/lib/answers/price";

describe("parsePrice", () => {
  it("reads units", () => {
    expect(parsePrice("20 копеек")).toEqual({ value: 0.2, currency: "rub" });
    expect(parsePrice("1,5 млн долларов")).toEqual({ value: 1.5e6, currency: "usd" });
    expect(parsePrice("$499")).toEqual({ value: 499, currency: "usd" });
    expect(parsePrice("450 000 000 долларов")?.value).toBe(450e6);
    expect(parsePrice("около ста")).toBeNull();
  });
});

describe("priceWithinTolerance", () => {
  it("accepts ±20%", () => {
    expect(priceWithinTolerance("5 копеек", "5 копеек")).toBe(true);
    expect(priceWithinTolerance("22 копейки", "20 копеек")).toBe(true);
    expect(priceWithinTolerance("25 копеек", "20 копеек")).toBe(false);
    expect(priceWithinTolerance("0,2 рубля", "20 копеек")).toBe(true);
    expect(priceWithinTolerance("20", "20 копеек")).toBe(true);
    expect(priceWithinTolerance("550", "499 долларов")).toBe(true);
    expect(priceWithinTolerance("650 долларов", "499 долларов")).toBe(false);
    expect(priceWithinTolerance("400 млн", "450 млн долларов")).toBe(true);
    expect(priceWithinTolerance("499 рублей", "499 долларов")).toBe(false);
  });
  it("leaves non-numbers to the usual check", () => {
    expect(priceWithinTolerance("не знаю", "20 копеек")).toBeNull();
  });
});
