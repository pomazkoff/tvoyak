import { describe, expect, it } from "vitest";
import { isContact, leadMessage, parseLead } from "./lead";

const base = {
  name: "Анна",
  company: "Бар «Ромашка»",
  type: "bar",
  contact: "@anna_bar",
};

describe("parseLead", () => {
  it("принимает минимальную заявку", () => {
    const r = parseLead(base);
    expect(r).toEqual({
      ok: true,
      lead: { ...base, eventDate: null, comment: null },
    });
  });

  it("чистит пробелы и сохраняет дату и комментарий", () => {
    const r = parseLead({
      ...base,
      name: "  Анна   К. ",
      eventDate: "2026-12-25",
      comment: " 40 гостей\r\nсвои вопросы ",
    });
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.lead.name).toBe("Анна К.");
      expect(r.lead.eventDate).toBe("2026-12-25");
      expect(r.lead.comment).toBe("40 гостей\nсвои вопросы");
    }
  });

  it("ловит бота по полю-ловушке", () => {
    expect(parseLead({ ...base, website: "http://spam" })).toEqual({
      ok: "spam",
    });
  });

  it("требует обязательные поля", () => {
    expect(parseLead({ ...base, name: " " })).toMatchObject({
      ok: false,
      field: "name",
    });
    expect(parseLead({ ...base, company: "" })).toMatchObject({
      field: "company",
    });
    expect(parseLead({ ...base, type: "vip" })).toMatchObject({
      error: "bad_type",
    });
    expect(parseLead({ ...base, contact: "позвоните" })).toMatchObject({
      error: "bad_contact",
    });
    expect(parseLead(null)).toMatchObject({ ok: false });
  });

  it("проверяет дату и длину", () => {
    expect(parseLead({ ...base, eventDate: "2026-02-30" })).toMatchObject({
      error: "bad_date",
    });
    expect(parseLead({ ...base, comment: "я".repeat(1501) })).toMatchObject({
      error: "too_long",
    });
  });
});

describe("isContact", () => {
  it.each([
    "+7 (999) 123-45-67",
    "89991234567",
    "a@b.ru",
    "@nick_name",
    "t.me/nick_name",
  ])("ok: %s", (v) => expect(isContact(v)).toBe(true));
  it.each(["123", "@ab", "nick", "a@b"])("нет: %s", (v) =>
    expect(isContact(v)).toBe(false),
  );
});

it("leadMessage собирает текст без пустых строк", () => {
  const r = parseLead(base);
  if (r.ok !== true) throw new Error("bad");
  const text = leadMessage(r.lead);
  expect(text).toContain("Тип: Бар, ресторан, антикафе");
  expect(text).not.toContain("Дата");
});
