/**
 * Пополнение 27.11.2026: картиночные задания, собранные вручную, как 13.11, 16.11 и 23.11
 * (автогенерация GROW_PICTURES тогда почти всё отбраковала: повторы ответов и
 * несуществующие файлы Commons). Черновики проходят тот же reviewDrafts
 * (безопасность, повторы, утечка, проход picture: ребус читается в ответ,
 * эмодзи есть в Twemoji, файл Commons существует, лицензия свободная) и
 * ложатся в пачки question_packs; выкладка — scripts/refills/2026-11-27-pictures.sql.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-27-manual-pictures.ts [--check]
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
    { answer: "Столб", value: 200, prompt: "Ребус № 165. Слово из 5 букв.", spec: { parts: [num("100", "сто"), txt("ЛБ")] } },
    { answer: "Котёл", variants: ["Котел"], value: 200, prompt: "Ребус № 166. Слово из 5 букв.", spec: { parts: [pic("🐱", "кот"), txt("ЁЛ")] } },
    { answer: "Носилки", value: 300, prompt: "Ребус № 167. Слово из 7 букв.", spec: { parts: [pic("👃", "нос"), txt("ИЛКИ")] } },
    { answer: "Домовой", value: 300, prompt: "Ребус № 168. Слово из 7 букв.", spec: { parts: [pic("🏠", "дом"), txt("ОВОЙ")] } },
    { answer: "Шарманка", value: 300, prompt: "Ребус № 169. Слово из 8 букв.", spec: { parts: [pic("🎈", "шар"), txt("МАНКА")] } },
    { answer: "Тритон", value: 400, prompt: "Ребус № 170. Слово из 6 букв.", spec: { parts: [num("3", "три"), txt("ТОН")] } },
  ],
  emoji: [
    { answer: "Головоломка", variants: ["Inside Out", "Головоломка 2"], value: 300, prompt: "Эмодзи-шифр № 96: мультфильм.", spec: { lines: [["🧠", "🎛️"], ["😄", "😢", "😡", "😱", "🤢"]] } },
    { answer: "Теремок", value: 200, prompt: "Эмодзи-шифр № 97: сказка.", spec: { lines: [["🏠", "🐭", "🐸", "🐰"], ["🦊", "🐺", "🐻", "💥"]] } },
    { answer: "Морозко", value: 300, prompt: "Эмодзи-шифр № 98: сказка и фильм.", spec: { lines: [["❄️", "👴", "🌲"], ["👧", "🥶", "🎁"]] } },
    { answer: "Миньоны", variants: ["Minions", "Гадкий я"], value: 200, prompt: "Эмодзи-шифр № 99: мультфильм.", spec: { lines: [["💛", "👓", "🍌"], ["👖", "🦹‍♂️", "😂"]] } },
    { answer: "Старик Хоттабыч", variants: ["Хоттабыч"], value: 300, prompt: "Эмодзи-шифр № 100: книга и фильм.", spec: { lines: [["👴", "🧞"], ["🏺", "🧔", "✨"]] } },
    { answer: "Тише едешь — дальше будешь", variants: ["Тише едешь, дальше будешь", "Тише едешь дальше будешь"], value: 400, prompt: "Эмодзи-шифр № 101: пословица.", spec: { lines: [["🤫", "🚗"], ["➡️", "🏁"]] } },
  ],
  hidden: [
    { answer: "Сова", variants: ["Филин"], value: 200, prompt: "Найди лишнее № 126: что здесь лишнее?", spec: { base: "🦅", odd: "🦉", cols: 8, rows: 5, seed: 2711 } },
    { answer: "Ёлка", variants: ["Ель", "Елка", "Ёлочка"], value: 300, prompt: "Найди лишнее № 127: что здесь лишнее?", spec: { base: "🌳", odd: "🌲", cols: 8, rows: 5, seed: 2712 } },
    { answer: "Паук", value: 300, prompt: "Найди лишнее № 128: что здесь лишнее?", spec: { base: "🐜", odd: "🕷️", cols: 8, rows: 5, seed: 2713 } },
    { answer: "Луна", variants: ["Месяц", "Полумесяц"], value: 300, prompt: "Найди лишнее № 129: что здесь лишнее?", spec: { base: "🍌", odd: "🌙", cols: 8, rows: 5, seed: 2714 } },
  ],
  fragment: [
    { answer: "Собор Парижской Богоматери", variants: ["Нотр-Дам", "Нотр-Дам-де-Пари", "Notre-Dame"], value: 300, prompt: "По фрагменту № 44: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 2744 }, file: "Notre-Dame de Paris, 4 October 2017.jpg" },
    { answer: "Москва-Сити", variants: ["Москва Сити", "ММДЦ Москва-Сити", "Сити"], value: 200, prompt: "По фрагменту № 45: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 2745 }, file: "Moscow-City 04.jpg" },
    { answer: "Эмпайр-стейт-билдинг", variants: ["Эмпайр-Стейт-Билдинг", "Empire State Building", "Эмпайр стейт"], value: 400, prompt: "По фрагменту № 46: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 2746 }, file: "Empire State Building (aerial view).jpg" },
    { answer: "Петра", variants: ["Петра, Иордания", "Эд-Дейр", "Ад-Дейр"], value: 500, prompt: "По фрагменту № 47: достопримечательность.", spec: { mode: "tiles", cols: 4, rows: 3, seed: 2747 }, file: "Al Deir Petra.JPG" },
  ],
  blur: [
    { answer: "Капибара", variants: ["Водосвинка"], value: 200, prompt: "Размытое фото № 45: животное.", spec: { effect: "blur" }, file: "Capybaracropped.jpg" },
    { answer: "Сурикат", variants: ["Суриката"], value: 300, prompt: "Размытое фото № 46: животное.", spec: { effect: "blur" }, file: "Meerkat (Suricata suricatta) Tswalu.jpg" },
    { answer: "Ёж", variants: ["Еж", "Ёжик", "Ежик"], value: 200, prompt: "Размытое фото № 47: животное.", spec: { effect: "blur" }, file: "Igel.JPG" },
    { answer: "Аксолотль", variants: ["Амбистома"], value: 400, prompt: "Размытое фото № 48: животное.", spec: { effect: "blur" }, file: "Axolotl ganz.jpg" },
  ],
  logo: [
    { answer: "LEGO", variants: ["Лего"], value: 200, prompt: "Логотип № 76: бренд игрушек.", spec: { effect: "blur", background: "#ffffff" }, file: "LEGO logo.svg" },
    { answer: "Burger King", variants: ["Бургер Кинг"], value: 300, prompt: "Логотип № 77: сеть ресторанов.", spec: { effect: "blur", background: "#ffffff" }, file: "Burger King 2020.svg" },
    { answer: "Pepsi", variants: ["Пепси"], value: 200, prompt: "Логотип № 78: напиток.", spec: { effect: "blur", background: "#ffffff" }, file: "Pepsi 2023.svg" },
    { answer: "Netflix", variants: ["Нетфликс"], value: 300, prompt: "Логотип № 79: стриминговый сервис.", spec: { effect: "blur", background: "#ffffff" }, file: "Netflix 2015 logo.svg" },
    { answer: "Coca-Cola", variants: ["Кока-кола", "Кока-Кола", "Coca Cola"], value: 200, prompt: "Логотип № 80: напиток.", spec: { effect: "blur", background: "#ffffff" }, file: "Coca-Cola logo.svg" },
    { answer: "Samsung", variants: ["Самсунг"], value: 200, prompt: "Логотип № 81: технологическая компания.", spec: { effect: "blur", background: "#ffffff" }, file: "Samsung Logo.svg" },
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
        source_notes: `Пополнение 27.11.2026 — картинки вручную (${format}): ${PICTURE_CATEGORY[format]}`,
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
