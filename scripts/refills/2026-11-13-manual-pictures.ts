/**
 * Пополнение 13.11.2026: картиночные задания, собранные вручную, потому что
 * автогенерация (GROW_PICTURES) почти всё отбраковала (повторы ответов и
 * несуществующие файлы Commons). Черновики проходят тот же reviewDrafts
 * (безопасность, повторы, утечка, проход picture: ребус читается в ответ,
 * эмодзи есть в Twemoji, файл Commons существует, лицензия свободная) и
 * ложатся в пачки question_packs; выкладка — scripts/refills/2026-11-13-pictures.sql.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-13-manual-pictures.ts [--check]
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
    { answer: "Сырок", value: 200, prompt: "Ребус № 150. Слово из 5 букв.", spec: { parts: [pic("🧀", "сыр"), txt("ОК")] } },
    { answer: "Лисица", value: 300, prompt: "Ребус № 151. Слово из 6 букв.", spec: { parts: [pic("🦊", "лиса", { cutEnd: 1 }), txt("ИЦА")] } },
    { answer: "Стопка", value: 300, prompt: "Ребус № 152. Слово из 6 букв.", spec: { parts: [num("100", "сто"), txt("ПКА")] } },
  ],
  emoji: [
    { answer: "Звёздные войны", variants: ["Star Wars"], value: 300, prompt: "Эмодзи-шифр № 84: фильм.", spec: { lines: [["⭐", "⚔️", "🌌", "🤖"]] } },
    { answer: "Человек-паук", variants: ["Spider-Man", "Спайдермен"], value: 300, prompt: "Эмодзи-шифр № 85: фильм.", spec: { lines: [["🕷️", "🧑", "🏙️", "🕸️"]] } },
    { answer: "Белоснежка и семь гномов", variants: ["Белоснежка"], value: 400, prompt: "Эмодзи-шифр № 86: мультфильм.", spec: { lines: [["👸", "🍎", "😴"], ["7️⃣", "⛏️"]] } },
  ],
  hidden: [
    { answer: "Тигр", value: 200, prompt: "Найди лишнее № 115: что здесь лишнее?", spec: { base: "🦁", odd: "🐯", cols: 8, rows: 5, seed: 1311 } },
    { answer: "Персик", value: 300, prompt: "Найди лишнее № 116: что здесь лишнее?", spec: { base: "🍊", odd: "🍑", cols: 8, rows: 5, seed: 1312 } },
    { answer: "Улитка", value: 200, prompt: "Найди лишнее № 117: что здесь лишнее?", spec: { base: "🐛", odd: "🐌", cols: 8, rows: 5, seed: 1313 } },
  ],
  fragment: [
    { answer: "Биг-Бен", variants: ["Елизаветинская башня", "Вестминстерский дворец"], value: 400, prompt: "По фрагменту № 34: достопримечательность.", spec: { mode: "zoom", focus: [0.67, 0.42], scale: 5 }, file: "Big Ben at sunset - 2014-10-27 17-30.jpg" },
    { answer: "Пирамиды Гизы", variants: ["Пирамида Хеопса", "Египетские пирамиды", "Пирамиды"], value: 300, prompt: "По фрагменту № 35: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 1335 }, file: "All Gizah Pyramids.jpg" },
    { answer: "Ангкор-Ват", variants: ["Ангкор"], value: 600, prompt: "По фрагменту № 36: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 1336 }, file: "Angkor Wat with its reflection (cropped).jpg" },
  ],
  blur: [
    { answer: "Филин", variants: ["Сова"], value: 300, prompt: "Размытое фото № 37: животное.", spec: { effect: "blur" }, file: "Bubo bubo portrait.jpg" },
    { answer: "Бегемот", variants: ["Гиппопотам"], value: 300, prompt: "Размытое фото № 38: животное.", spec: { effect: "blur" }, file: "Hippopotamus amphibius Whipsnade Zoo.jpg" },
  ],
  logo: [
    { answer: "Python", variants: ["Питон", "Пайтон"], value: 400, prompt: "Логотип № 64: язык программирования.", spec: { effect: "blur", background: "#ffffff" }, file: "Python-logo-notext.svg" },
    { answer: "Ubuntu", variants: ["Убунту"], value: 500, prompt: "Логотип № 65: операционная система.", spec: { effect: "blur", background: "#ffffff" }, file: "Logo-ubuntu cof-orange-hex.svg" },
    { answer: "Toyota", variants: ["Тойота"], value: 300, prompt: "Логотип № 66: автомобили.", spec: { effect: "blur", background: "#ffffff" }, file: "Toyota Symbol.svg" },
    { answer: "Ethereum", variants: ["Эфириум", "Эфир"], value: 500, prompt: "Логотип № 67: криптовалюта.", spec: { effect: "blur", background: "#ffffff" }, file: "Ethereum logo 2014.svg" },
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
        source_notes: `Пополнение 13.11.2026 — картинки вручную (${format}): ${PICTURE_CATEGORY[format]}`,
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
