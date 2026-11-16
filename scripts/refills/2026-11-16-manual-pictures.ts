/**
 * Пополнение 16.11.2026: картиночные задания, собранные вручную, как и 13.11
 * (автогенерация GROW_PICTURES тогда почти всё отбраковала: повторы ответов и
 * несуществующие файлы Commons). Черновики проходят тот же reviewDrafts
 * (безопасность, повторы, утечка, проход picture: ребус читается в ответ,
 * эмодзи есть в Twemoji, файл Commons существует, лицензия свободная) и
 * ложатся в пачки question_packs; выкладка — scripts/refills/2026-11-16-pictures.sql.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-16-manual-pictures.ts [--check]
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
    { answer: "Совесть", value: 300, prompt: "Ребус № 153. Слово из 7 букв.", spec: { parts: [pic("🦉", "сова", { cutEnd: 1 }), txt("ЕСТЬ")] } },
    { answer: "Носки", value: 200, prompt: "Ребус № 154. Слово из 5 букв.", spec: { parts: [pic("👃", "нос"), txt("КИ")] } },
    { answer: "Домкрат", value: 300, prompt: "Ребус № 155. Слово из 7 букв.", spec: { parts: [pic("🏠", "дом"), txt("КРАТ")] } },
    { answer: "Слоган", value: 300, prompt: "Ребус № 156. Слово из 6 букв.", spec: { parts: [pic("🐘", "слон", { cutEnd: 1 }), txt("ГАН")] } },
    { answer: "Трибуна", value: 300, prompt: "Ребус № 157. Слово из 7 букв.", spec: { parts: [num("3", "три"), txt("БУНА")] } },
    { answer: "Ключица", value: 300, prompt: "Ребус № 158. Слово из 7 букв.", spec: { parts: [pic("🔑", "ключ"), txt("ИЦА")] } },
  ],
  emoji: [
    { answer: "Пятый элемент", variants: ["The Fifth Element"], value: 400, prompt: "Эмодзи-шифр № 87: фильм.", spec: { lines: [["5️⃣", "🔥", "💧", "🌍", "💨"], ["👩‍🦰", "🚕"]] } },
    { answer: "Бременские музыканты", variants: ["По следам бременских музыкантов"], value: 300, prompt: "Эмодзи-шифр № 88: мультфильм.", spec: { lines: [["🫏", "🐕", "🐈", "🐓"], ["🎸", "🎶"]] } },
    { answer: "Зверополис", variants: ["Zootopia", "Zootropolis"], value: 300, prompt: "Эмодзи-шифр № 89: мультфильм.", spec: { lines: [["🐰", "👮‍♀️", "🦊"], ["🏙️", "🦁", "🐑"]] } },
    { answer: "Паддингтон", variants: ["Приключения Паддингтона", "Paddington"], value: 400, prompt: "Эмодзи-шифр № 90: фильм.", spec: { lines: [["🐻", "🎩", "🧥"], ["🍊", "🥪", "🇬🇧"]] } },
  ],
  hidden: [
    { answer: "Зебра", value: 200, prompt: "Найди лишнее № 118: что здесь лишнее?", spec: { base: "🐴", odd: "🦓", cols: 8, rows: 5, seed: 1611 } },
    { answer: "Осьминог", value: 200, prompt: "Найди лишнее № 119: что здесь лишнее?", spec: { base: "🦑", odd: "🐙", cols: 8, rows: 5, seed: 1612 } },
    { answer: "Волейбольный мяч", variants: ["Волейбол"], value: 300, prompt: "Найди лишнее № 120: что здесь лишнее?", spec: { base: "⚽", odd: "🏐", cols: 8, rows: 5, seed: 1613 } },
    { answer: "Дыня", value: 300, prompt: "Найди лишнее № 121: что здесь лишнее?", spec: { base: "🍏", odd: "🍈", cols: 8, rows: 5, seed: 1614 } },
  ],
  fragment: [
    { answer: "Собор Василия Блаженного", variants: ["Храм Василия Блаженного", "Покровский собор"], value: 300, prompt: "По фрагменту № 37: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 1637 }, file: "Catedral de San Basilio, Moscú, Rusia, 2016-10-03, DD 05-06 HDR.jpg" },
    { answer: "Петра", variants: ["Эль-Хазне", "Сокровищница"], value: 500, prompt: "По фрагменту № 38: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 1638 }, file: "Al-Khazneh (The Treasury), Petra, Jordan.jpg" },
    { answer: "Чичен-Ица", variants: ["Пирамида Кукулькана", "Эль-Кастильо"], value: 500, prompt: "По фрагменту № 39: достопримечательность.", spec: { mode: "zoom", focus: [0.5, 0.45], scale: 5 }, file: "Chichen Itza 3.jpg" },
    { answer: "Бурдж-Халифа", variants: ["Бурдж Халифа", "Burj Khalifa"], value: 400, prompt: "По фрагменту № 40: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 1640 }, file: "Burj Khalifa (16260269606).jpg" },
  ],
  blur: [
    { answer: "Тукан", value: 300, prompt: "Размытое фото № 39: животное.", spec: { effect: "blur" }, file: "Toco Toucan (Ramphastos toco) - 48153967707.jpg" },
    { answer: "Кенгуру", value: 300, prompt: "Размытое фото № 40: животное.", spec: { effect: "blur" }, file: "Eastern Grey Kangaroo Feeding edited.jpg" },
    { answer: "Альпака", variants: ["Лама"], value: 300, prompt: "Размытое фото № 41: животное.", spec: { effect: "blur" }, file: "Alpaca, Lama pacos, Chrupek in Zabrze, Silesian Voivodeship, Poland, October 2023.jpg" },
  ],
  logo: [
    { answer: "Bitcoin", variants: ["Биткоин", "Биткойн"], value: 300, prompt: "Логотип № 68: криптовалюта.", spec: { effect: "blur", background: "#ffffff" }, file: "Bitcoin logo Satoshi Nakamoto.svg" },
    { answer: "JavaScript", variants: ["Джаваскрипт", "JS"], value: 300, prompt: "Логотип № 69: язык программирования.", spec: { effect: "blur", background: "#ffffff" }, file: "Unofficial JavaScript logo 2.svg" },
    { answer: "Debian", variants: ["Дебиан"], value: 500, prompt: "Логотип № 70: операционная система.", spec: { effect: "blur", background: "#ffffff" }, file: "Openlogo-debianV2.svg" },
    { answer: "Mozilla Thunderbird", variants: ["Thunderbird", "Тандерберд"], value: 500, prompt: "Логотип № 71: почтовая программа.", spec: { effect: "blur", background: "#ffffff" }, file: "Mozilla Thunderbird logo.png" },
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
        source_notes: `Пополнение 16.11.2026 — картинки вручную (${format}): ${PICTURE_CATEGORY[format]}`,
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
