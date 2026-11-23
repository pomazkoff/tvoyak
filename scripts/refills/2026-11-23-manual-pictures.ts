/**
 * Пополнение 23.11.2026: картиночные задания, собранные вручную, как 13.11 и 16.11
 * (автогенерация GROW_PICTURES тогда почти всё отбраковала: повторы ответов и
 * несуществующие файлы Commons). Черновики проходят тот же reviewDrafts
 * (безопасность, повторы, утечка, проход picture: ребус читается в ответ,
 * эмодзи есть в Twemoji, файл Commons существует, лицензия свободная) и
 * ложатся в пачки question_packs; выкладка — scripts/refills/2026-11-23-pictures.sql.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-23-manual-pictures.ts [--check]
 */
import { commonsImageUrl } from "@/lib/pictures/commons";
import {
  DEFAULT_REVEAL,
  PICTURE_CATEGORY,
  type PictureFormat,
} from "@/lib/pictures/types";
import { checkPictureDraft } from "@/lib/pictures/validate";
import { loadExisting, reviewDrafts } from "@/lib/packs/pipeline";
import type { DraftQuestion } from "@/lib/packs/review";
import { getServiceSupabase } from "@/lib/supabase/admin";

type Item = {
  answer: string;
  variants?: string[];
  value: number;
  prompt: string;
  spec: unknown;
  file?: string;
};

const pic = (emoji: string, word: string, extra: Record<string, unknown> = {}) => ({
  t: "pic",
  emoji,
  word,
  ...extra,
});
const txt = (text: string) => ({ t: "txt", text });
const num = (text: string, word: string) => ({ t: "num", text, word });

const ITEMS: Partial<Record<PictureFormat, Item[]>> = {
  rebus: [
    { answer: "Лукошко", value: 300, prompt: "Ребус № 159. Слово из 7 букв.", spec: { parts: [pic("🧅", "лук"), txt("ОШКО")] } },
    { answer: "Сырость", value: 300, prompt: "Ребус № 160. Слово из 7 букв.", spec: { parts: [pic("🧀", "сыр"), txt("ОСТЬ")] } },
    { answer: "Хлебница", value: 200, prompt: "Ребус № 161. Слово из 8 букв.", spec: { parts: [pic("🍞", "хлеб"), txt("НИЦА")] } },
    { answer: "Звездочёт", variants: ["Звездочет"], value: 300, prompt: "Ребус № 162. Слово из 9 букв.", spec: { parts: [pic("⭐", "звезда", { cutEnd: 1 }), txt("ОЧЁТ")] } },
    { answer: "Огород", value: 300, prompt: "Ребус № 163. Слово из 6 букв.", spec: { parts: [pic("🔥", "огонь", { cutEnd: 2 }), txt("РОД")] } },
    { answer: "Капитан", value: 300, prompt: "Ребус № 164. Слово из 7 букв.", spec: { parts: [pic("💧", "капля", { cutEnd: 2 }), txt("ИТАН")] } },
  ],
  emoji: [
    { answer: "Назад в будущее", variants: ["Back to the Future"], value: 300, prompt: "Эмодзи-шифр № 91: фильм.", spec: { lines: [["🔙", "🚗", "⚡"], ["⏰", "🧑‍🔬", "🛹"]] } },
    { answer: "Джуманджи", variants: ["Jumanji"], value: 400, prompt: "Эмодзи-шифр № 92: фильм.", spec: { lines: [["🎲", "🥁", "🌴"], ["🐒", "🦏", "🐘"]] } },
    { answer: "Сказка о рыбаке и рыбке", variants: ["Золотая рыбка", "О рыбаке и рыбке"], value: 300, prompt: "Эмодзи-шифр № 93: произведение Пушкина.", spec: { lines: [["👴", "🎣", "🐟", "👑"], ["👵", "🏰", "🌊"]] } },
    { answer: "Под лежачий камень вода не течёт", variants: ["Под лежачий камень вода не течет"], value: 400, prompt: "Эмодзи-шифр № 94: пословица.", spec: { lines: [["🛌", "🪨"], ["🚫", "💧", "➡️"]] } },
    { answer: "Как приручить дракона", variants: ["How to Train Your Dragon"], value: 300, prompt: "Эмодзи-шифр № 95: мультфильм.", spec: { lines: [["👦", "🤝", "🐉"], ["🦴", "🐟", "🛡️"]] } },
  ],
  hidden: [
    { answer: "Утка", variants: ["Утёнок"], value: 200, prompt: "Найди лишнее № 122: что здесь лишнее?", spec: { base: "🐥", odd: "🦆", cols: 8, rows: 5, seed: 2311 } },
    { answer: "Лимон", value: 300, prompt: "Найди лишнее № 123: что здесь лишнее?", spec: { base: "🧀", odd: "🍋", cols: 8, rows: 5, seed: 2312 } },
    { answer: "Слон", value: 200, prompt: "Найди лишнее № 124: что здесь лишнее?", spec: { base: "🦏", odd: "🐘", cols: 8, rows: 5, seed: 2313 } },
    { answer: "Ракета", value: 300, prompt: "Найди лишнее № 125: что здесь лишнее?", spec: { base: "✈️", odd: "🚀", cols: 8, rows: 5, seed: 2314 } },
  ],
  fragment: [
    { answer: "Исаакиевский собор", variants: ["Исаакий"], value: 300, prompt: "По фрагменту № 40: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 2340 }, file: "Saint Isaac's Cathedral in SPB.jpeg" },
    { answer: "Родина-мать зовёт!", variants: ["Родина-мать", "Мамаев курган", "Родина-мать зовёт"], value: 300, prompt: "По фрагменту № 41: достопримечательность.", spec: { mode: "zoom", focus: [0.5, 0.4], scale: 5 }, file: "The Motherland Calls, 2019.jpg" },
    { answer: "Букингемский дворец", variants: ["Букингемский"], value: 400, prompt: "По фрагменту № 42: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 2342 }, file: "Buckingham Palace London Morning 2020 04.jpg" },
    { answer: "Петергоф", variants: ["Большой каскад", "Петродворец"], value: 400, prompt: "По фрагменту № 43: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 2343 }, file: "Grand Cascade of Peterhof 01.jpg" },
  ],
  blur: [
    { answer: "Бобр", value: 300, prompt: "Размытое фото № 42: животное.", spec: { effect: "blur" }, file: "North American beaver (Castor canadensis) (46677957975).jpg" },
    { answer: "Страус", value: 200, prompt: "Размытое фото № 43: животное.", spec: { effect: "blur" }, file: "Struthio camelus (captive) in Jardim Zoológico de Curitiba.jpg" },
    { answer: "Пеликан", value: 300, prompt: "Размытое фото № 44: животное.", spec: { effect: "blur" }, file: "Great white pelican (Pelecanus onocrotalus).jpg" },
  ],
  logo: [
    { answer: "BMW", variants: ["БМВ"], value: 200, prompt: "Логотип № 72: автомобильная марка.", spec: { effect: "blur", background: "#ffffff" }, file: "BMW.svg" },
    { answer: "USB", variants: ["ЮСБ", "ЮЭсБи"], value: 300, prompt: "Логотип № 73: компьютерный разъём.", spec: { effect: "blur", background: "#ffffff" }, file: "USB icon.svg" },
    { answer: "Godot", variants: ["Годот", "Godot Engine"], value: 500, prompt: "Логотип № 74: игровой движок.", spec: { effect: "blur", background: "#ffffff" }, file: "Godot icon.svg" },
    { answer: "Mazda", variants: ["Мазда"], value: 300, prompt: "Логотип № 75: автомобильная марка.", spec: { effect: "blur", background: "#ffffff" }, file: "Mazda logo with emblem, new.svg" },
  ],
};

function drafts(format: PictureFormat): DraftQuestion[] {
  return (ITEMS[format] ?? []).map((item) => ({
    category: PICTURE_CATEGORY[format],
    prompt: item.prompt,
    answer: item.answer,
    variants: item.variants ?? [],
    value: item.value,
    kind: "image" as const,
    curtain: false,
    picture: format,
    picture_spec: item.spec,
    image_url: item.file ? commonsImageUrl(item.file) : null,
    reveal_seconds: DEFAULT_REVEAL[format],
  })) as DraftQuestion[];
}

async function main() {
  // --only=blur — повторить один формат; --skip=Бегемот — пропустить уже принятые ответы.
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice(7);
  const skip = new Set(
    (process.argv.find((arg) => arg.startsWith("--skip="))?.slice(7) ?? "").split(",").filter(Boolean),
  );
  for (const list of Object.values(ITEMS))
    list?.splice(0, list.length, ...list.filter((item) => !skip.has(item.answer)));
  const formats = (Object.keys(ITEMS) as PictureFormat[]).filter((format) => !only || format === only);
  if (process.argv.includes("--check")) {
    for (const format of formats)
      for (const draft of drafts(format)) {
        const { problems } = await checkPictureDraft(draft as never);
        console.log(format, draft.answer, problems.length ? problems : "ok");
      }
    return;
  }
  const supabase = getServiceSupabase();
  const existing = await loadExisting();
  for (const format of formats) {
    const { data, error } = await supabase
      .from("question_packs")
      .insert({
        status: "reviewing",
        source_notes: `Пополнение 23.11.2026 — картинки вручную (${format}): ${PICTURE_CATEGORY[format]}`,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "pack_insert");
    const ok = await reviewDrafts(data.id as string, drafts(format), {
      concurrency: 3,
      existing,
    });
    await supabase
      .from("question_packs")
      .update({ status: ok ? "ready" : "failed", error: ok ? null : "empty_after_review" })
      .eq("id", data.id);
    console.log(`${format}: pack ${data.id} +${ok}/${drafts(format).length}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
