import { describe, expect, it } from "vitest";
import { checkAgainstVariants, checkAnswerLocally } from "@/lib/answers/check";
import { normalizeAnswer } from "@/lib/answers/normalize";
import { numberWordsToDigits } from "@/lib/answers/numbers";
import { parsePrice, priceWithinTolerance } from "@/lib/answers/price";

describe("numberWordsToDigits", () => {
  it("складывает составные числительные", () => {
    expect(numberWordsToDigits("сто двадцать три")).toBe("123");
    expect(normalizeAnswer("Ни одной: горошины не ходят")).toBe(
      "0 горошины не ходят",
    );
    expect(numberWordsToDigits("двести пять рублей")).toBe("205 рублей");
    expect(numberWordsToDigits("пятьдесят миллионов")).toBe("50 миллионов");
    expect(numberWordsToDigits("один раз")).toBe("1 раз");
  });
  it("не склеивает два отдельных числа", () => {
    expect(numberWordsToDigits("два три")).toBe("2 3");
    expect(numberWordsToDigits("двадцать тридцать")).toBe("20 30");
  });
  it("понимает падежи", () => {
    expect(normalizeAnswer("Четырьмя")).toBe("4");
    expect(normalizeAnswer("двух часов")).toBe("2 часов");
  });
  it("не трогает обычные слова", () => {
    expect(numberWordsToDigits("семья сорока троица")).toBe(
      "семья сорока троица",
    );
  });
});

describe("цифры и числительные в ответе", () => {
  const cases: Array<[string, string, boolean]> = [
    ["4 кошки", "Четыре", true],
    ["четыре кошки", "4", true],
    ["4", "Четыре", true],
    ["8 концов", "Восемь", true],
    ["восемь", "8", true],
    ["1 раз", "Один раз", true],
    ["1", "Один раз", true],
    ["один раз", "1 раз", true],
    ["2 килограмма", "Два килограмма", true],
    ["семь", "Восемь", false],
    ["7 концов", "Восемь", false],
    ["3 года", "Три месяца", false],
    ["4 или 5", "Четыре", false],
    ["7", "Белоснежка и семь гномов", false],
    ["десять раз", "Один раз", false],
    ["1914 год", "1941 год", false],
  ];
  it.each(cases)("«%s» на «%s» → %s", (given, expected, correct) => {
    expect(checkAnswerLocally(given, expected).correct).toBe(correct);
  });
  it("работает через варианты", () => {
    expect(checkAgainstVariants("4 кошки", "Четыре", ["4"]).correct).toBe(true);
  });
});

describe("цена: числительные и множитель эталона", () => {
  it("числа словами", () => {
    expect(parsePrice("пятьдесят миллионов долларов")).toEqual({
      value: 50e6,
      currency: "usd",
    });
    expect(parsePrice("полтора миллиона")?.value).toBe(1.5e6);
    expect(parsePrice("миллион долларов")?.value).toBe(1e6);
    expect(parsePrice("двадцать копеек")).toEqual({
      value: 0.2,
      currency: "rub",
    });
    expect(
      priceWithinTolerance("пятьдесят миллионов", "50 миллионов долларов"),
    ).toBe(true);
    expect(priceWithinTolerance("сто миллионов", "50 млн долларов")).toBe(
      false,
    );
  });
  it("голое число — в единицах эталона", () => {
    expect(priceWithinTolerance("450", "450 миллионов долларов")).toBe(true);
    expect(priceWithinTolerance("44", "44 миллиарда долларов")).toBe(true);
    expect(priceWithinTolerance("500", "450 млн долларов")).toBe(true);
    expect(priceWithinTolerance("600", "450 млн долларов")).toBe(false);
    expect(priceWithinTolerance("450000000", "450 млн долларов")).toBe(true);
    expect(priceWithinTolerance("450 тысяч", "450 млн долларов")).toBe(false);
  });
});
