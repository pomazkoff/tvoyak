import { describe, expect, it } from "vitest";
import {
  hostLabelFromMeta,
  hostLabelFromUser,
  inviteCaption,
} from "./host-label";

describe("hostLabelFromMeta", () => {
  it("берёт имя, без фамилии", () => {
    expect(
      hostLabelFromMeta({
        full_name: "Илья Помазков",
        telegram_username: "ilya",
      }),
    ).toBe("Илья");
  });

  it("одно слово оставляет как есть", () => {
    expect(hostLabelFromMeta({ full_name: "Анна-Мария" })).toBe("Анна-Мария");
  });

  it("без имени берёт ник телеграма", () => {
    expect(hostLabelFromMeta({ telegram_username: "@tvoyak" })).toBe("tvoyak");
  });

  it("почту не показывает", () => {
    expect(
      hostLabelFromMeta({
        full_name: "host@example.com",
        telegram_username: "a@b.c",
      }),
    ).toBeNull();
    expect(
      hostLabelFromUser({
        user_metadata: {},
        email: "host@example.com",
      } as { user_metadata: Record<string, unknown> }),
    ).toBeNull();
  });

  it("пустое и ссылку отбрасывает", () => {
    expect(hostLabelFromMeta({})).toBeNull();
    expect(hostLabelFromMeta({ full_name: "  " })).toBeNull();
    expect(hostLabelFromMeta({ full_name: "https://evil.test" })).toBeNull();
    expect(hostLabelFromUser(null)).toBeNull();
  });

  it("режет слишком длинное имя", () => {
    const name = hostLabelFromMeta({ full_name: "Я".repeat(80) });
    expect(name && [...name].length).toBe(40);
  });
});

describe("inviteCaption", () => {
  it("собирает подпись только когда имя есть", () => {
    expect(inviteCaption("Илья")).toBe(
      "Вас приглашает Илья — первая партия бесплатно",
    );
    expect(inviteCaption(null)).toBeNull();
    expect(inviteCaption("")).toBeNull();
  });
});
