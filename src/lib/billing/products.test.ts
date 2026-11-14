import { describe, expect, it } from "vitest";
import {
  decideAccess,
  isDeviceId,
  isProductId,
  payPath,
  PRODUCTS,
} from "./products";

const base = {
  loggedIn: false,
  credits: 0,
  unlimitedUntil: null,
  freeUsedByDevice: false,
  freeUsedByUser: false,
  freeLimitByIp: false,
  now: Date.parse("2026-11-04T12:00:00Z"),
};

describe("decideAccess", () => {
  it("первая партия бесплатно даже без входа", () => {
    expect(decideAccess(base)).toEqual({ ok: true, kind: "free" });
  });
  it("после бесплатной на устройстве — нужен вход", () => {
    expect(decideAccess({ ...base, freeUsedByDevice: true })).toEqual({
      ok: false,
      error: "login_required",
    });
  });
  it("аккаунт уже тратил бесплатную — на новом устройстве нужна оплата", () => {
    expect(
      decideAccess({ ...base, loggedIn: true, freeUsedByUser: true }),
    ).toEqual({ ok: false, error: "payment_required" });
  });
  it("лимит по IP закрывает бесплатную", () => {
    expect(decideAccess({ ...base, freeLimitByIp: true }).ok).toBe(false);
  });
  it("кредит тратится, когда бесплатная использована", () => {
    expect(
      decideAccess({
        ...base,
        loggedIn: true,
        credits: 2,
        freeUsedByDevice: true,
      }),
    ).toEqual({ ok: true, kind: "credit" });
  });
  it("безлимит важнее всего, просроченный не считается", () => {
    expect(
      decideAccess({
        ...base,
        loggedIn: true,
        freeUsedByDevice: true,
        unlimitedUntil: "2026-11-20T00:00:00Z",
      }),
    ).toEqual({ ok: true, kind: "unlimited" });
    expect(
      decideAccess({
        ...base,
        loggedIn: true,
        freeUsedByDevice: true,
        unlimitedUntil: "2026-11-01T00:00:00Z",
      }).ok,
    ).toBe(false);
  });
});

describe("тарифы", () => {
  it("цены Ильи", () => {
    expect(PRODUCTS.game.priceRub).toBe(99);
    expect(PRODUCTS.month.priceRub).toBe(499);
    expect(isProductId("month")).toBe(true);
    expect(isProductId("year")).toBe(false);
    expect(payPath("game")).toBe("/pay?product=game");
    expect(payPath("month")).toBe("/pay?product=month");
  });
  it("id устройства", () => {
    expect(isDeviceId("a".repeat(32))).toBe(true);
    expect(isDeviceId("short")).toBe(false);
    expect(isDeviceId("x".repeat(20) + "<")).toBe(false);
  });
});
