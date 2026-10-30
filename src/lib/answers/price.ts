/**
 * «Сколько стоило?»: числовой ответ засчитывается с допуском ±20%.
 * Понимает «20 копеек», «0,2 руб», «1,5 млн долларов», «$499»,
 * «пятьдесят миллионов», «полтора миллиона»; голое «450» на эталон
 * «450 млн долларов» читается в единицах эталона.
 */
import { numberWordsToDigits } from "@/lib/answers/numbers";
import { PRICE_TOLERANCE } from "@/lib/packs/categories";

export type Currency = "rub" | "usd" | "eur" | null;

export type ParsedPrice = { value: number; currency: Currency };

const SCALE: Array<[RegExp, number]> = [
  [/^(млрд|миллиард)/, 1e9],
  [/^(млн|миллион)/, 1e6],
  [/^(тыс|тысяч|к$)/, 1e3],
];

/** Первое число в строке с множителем и валютой (рубли = базовая единица). */
export function parsePrice(raw: string): ParsedPrice | null {
  const text = priceText(raw);
  const match = text.match(
    /(\d+(?:[.,]\d+)?)\s*([a-zа-я$€₽.]*)\s*([a-zа-я$€₽.]*)/i,
  );
  if (!match) return null;
  let value = Number(match[1]!.replace(",", "."));
  if (!Number.isFinite(value)) return null;
  const words = `${match[2] ?? ""} ${match[3] ?? ""}`.trim().split(/\s+/);
  let currency: Currency = null;
  let kopecks = false;
  for (const word of words) {
    const scale = SCALE.find(([pattern]) => pattern.test(word));
    if (scale) value *= scale[1];
    if (/^(коп|к\.)/.test(word)) kopecks = true;
    if (/^(руб|р\.?$|₽)/.test(word)) currency = "rub";
    if (/^(долл|бакс|\$|usd)/.test(word)) currency = "usd";
    if (/^(евро|€|eur)/.test(word)) currency = "eur";
  }
  if (/\$/.test(text)) currency = "usd";
  if (/€/.test(text)) currency = "eur";
  if (/₽/.test(text)) currency = "rub";
  if (kopecks) {
    value /= 100;
    currency = "rub";
  }
  return { value, currency };
}

const SCALE_WORD = /(^|\s)(млрд|миллиард|млн|миллион|тыс|тысяч)/;

/** Нижний регистр, числительные словами → цифры, «миллион» → «1 миллион». */
function priceText(raw: string): string {
  let text = raw
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)(полтора|полторы)(?=\s|$)/g, "$11,5");
  text = numberWordsToDigits(text)
    // «2 сто» не бывает, а «5 тысяч 300» — бывает; склеиваем «тысяч N»
    .replace(/(\d)\s(тысяч\S*)\s(\d{1,3})(?=\s|$)/g, (_, a, _w, b) =>
      String(Number(a) * 1000 + Number(b)),
    );
  if (!/\d/.test(text) && SCALE_WORD.test(text)) text = `1 ${text}`;
  return text.replace(/(\d)[\s\u00a0](?=\d{3}\b)/g, "$1");
}

function scaleOf(raw: string): number {
  const text = priceText(raw);
  const hit = SCALE.find(([pattern]) =>
    text.split(/[\s\d.,]+/).some((word) => pattern.test(word)),
  );
  return hit?.[1] ?? 1;
}

/**
 * true/false — решено числом; null — в ответе нет числа (пусть решает
 * обычная проверка). Без единицы у игрока число берётся в единицах эталона
 * («20» на эталон «20 копеек» — это 20 копеек).
 */
export function priceWithinTolerance(
  given: string,
  expected: string,
  tolerance = PRICE_TOLERANCE,
): boolean | null {
  const want = parsePrice(expected);
  if (!want || want.value <= 0) return null;
  const got = parsePrice(given);
  if (!got) return null;
  const hasUnit =
    got.currency !== null || /[a-zа-я$€₽]/i.test(given.replace(/\d/g, ""));
  let value = got.value;
  if (!hasUnit || got.currency === null) {
    // Голое число (или только «тыс/млн»): в единицах эталона.
    const unitless = parsePrice(given.replace(/[^\d.,\sа-яa-z]/gi, ""));
    value = unitless?.value ?? got.value;
    if (
      /коп/.test(expected.toLowerCase()) &&
      !/коп|руб/.test(given.toLowerCase())
    ) {
      value /= 100;
    }
  } else if (want.currency && got.currency !== want.currency) {
    return false;
  }
  const within = (candidate: number) =>
    Math.abs(candidate - want.value) <= want.value * tolerance + 1e-9;
  if (within(value)) return true;
  // «450» на «450 млн долларов»: игрок не назвал множитель — берём эталонный.
  const wantScale = scaleOf(expected);
  if (wantScale > 1 && scaleOf(given) === 1) return within(value * wantScale);
  return false;
}
