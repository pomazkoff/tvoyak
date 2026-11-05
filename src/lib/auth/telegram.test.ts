import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { tgEmail, tokenFromStart } from "./telegram";

describe("tokenFromStart", () => {
  it("достаёт токен", () => {
    const t = "a".repeat(32);
    expect(tokenFromStart(`/start login_${t}`)).toBe(t);
    expect(tokenFromStart(`/start@tvoyak_bot login_${t}`)).toBe(t);
  });
  it("игнорирует чужое", () => {
    expect(tokenFromStart("/start")).toBeNull();
    expect(tokenFromStart("/start login_<x>")).toBeNull();
    expect(tokenFromStart("привет")).toBeNull();
  });
  it("почта по id", () => {
    expect(tgEmail(42)).toBe("tg42@users.tvoyak.ru");
  });
});
