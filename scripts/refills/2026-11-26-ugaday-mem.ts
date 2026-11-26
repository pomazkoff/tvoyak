/**
 * Новая тема «Угадай мем» (26.11.2026): смешанные форматы — звук (превью
 * iTunes, файл не скачиваем), откуда кадр, цитата/описание, мем по эмодзи.
 * Мемы, уже стоящие эталоном в теме «Мемы», не повторяем. Без политики и 18+.
 * Черновики проходят reviewDrafts и попадают в банк только после «Принять в
 * пул» на /admin.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-26-ugaday-mem.ts
 */
import { loadExisting, reviewDrafts } from "@/lib/packs/pipeline";
import type { DraftQuestion } from "@/lib/packs/review";
import { getServiceSupabase } from "@/lib/supabase/admin";

const CAT = "Угадай мем";

const text = (
  value: number,
  prompt: string,
  answer: string,
  variants: string[] = [],
): DraftQuestion => ({
  category: CAT,
  prompt,
  answer,
  variants,
  value,
  kind: "text",
  curtain: false,
});

const song = (
  value: number,
  prompt: string,
  answer: string,
  variants: string[],
  audio_url: string,
): DraftQuestion => ({
  category: CAT,
  prompt,
  answer,
  variants,
  value,
  kind: "music",
  curtain: true,
  audio_url,
  start_seconds: 0,
  end_seconds: 30,
});

const DRAFTS: DraftQuestion[] = [
  // --- по звуку: 30-секундные превью iTunes (проверены HEAD 200) ---
  song(
    100,
    "В 2020 году под этот трек разлетелся ролик с танцующими носильщиками. Как называют этот мем?",
    "Coffin Dance",
    [
      "Танец с гробом",
      "Coffin meme",
      "Танец похоронной команды",
      "Coffin Dance Meme",
    ],
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/57/ea/f2/57eaf245-bcb2-f607-e68f-7d2e736dbd1e/mzaf_2535066585061400438.plus.aac.p.m4a",
  ),
  song(
    200,
    "Под эту песню в 2004 году американец Гэри Бролсма снял ролик с веб-камеры, ставший одним из первых вирусных хитов. Как называют этот мем?",
    "Numa Numa",
    ["Нума Нума", "Numa Numa Dance", "Нума-нума"],
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/46/13/5e/46135e6b-2791-3e87-3d03-af55a79e5d34/mzaf_8471806707500924489.plus.aac.p.m4a",
  ),
  song(
    200,
    "Этот «гимн» злодея из детского сериала в 2016 году разобрали на тысячи ремиксов. Как называется песня?",
    "We Are Number One",
    ["We are number one", "Ви а намбер ван", "We Are Nº 1"],
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/fc/c1/da/fcc1da17-cff1-830c-2a00-10ca6714d11e/mzaf_8395500506314744928.plus.aac.p.m4a",
  ),
  song(
    300,
    "Под этот трек в мемах медленно «плывут» в космосе люди в неловких позах. Как называется песня?",
    "Shooting Stars",
    ["Shooting stars", "Шутинг старс", "Shooting Stars Bag Raiders"],
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/11/4f/ff/114fffb5-5bfd-7342-f97a-91d44d559cc4/mzaf_8206851760913978848.plus.aac.p.m4a",
  ),
  song(
    200,
    "В 2016 году японский комик в жёлтой шляпе сложил из двух фруктов и канцтовара эту короткую песню-мем. Как её обычно называют?",
    "PPAP",
    ["Pen Pineapple Apple Pen", "ППАП", "Pen-Pineapple-Apple-Pen"],
    "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/80/2e/f6/802ef6e7-fc75-3561-88c5-7d6f568bd5a0/mzaf_11624377278199208633.plus.aac.p.m4a",
  ),

  // --- откуда кадр / первоисточник ---
  text(
    100,
    "Мем «вот Джонни!» — это кадр, где герой топором пробивает дверь и выглядывает в отверстие. Из какого фильма Стэнли Кубрика этот кадр?",
    "Сияние",
    ["The Shining", "Сияние Кубрика", "The Shining 1980"],
  ),
  text(
    200,
    "Мем, где царь орёт одно короткое предложение и сбрасывает человека в колодец, взяли из голливудского фильма 2006 года про битву при Фермопилах. Из какого фильма эта сцена?",
    "300 спартанцев",
    ["300", "Триста спартанцев", "300 Spartans", "300 (фильм)"],
  ),
  text(
    200,
    "Кадр, где два героя в одинаковых красно-синих костюмах стоят друг напротив друга и тычут пальцами, разошёлся как мем про взаимные обвинения. Из какого мультсериала 1967 года этот кадр?",
    "Человек-паук",
    [
      "Spider-Man",
      "Spider-Man 1967",
      "The Amazing Spider-Man",
      "Человек-паук 1967",
    ],
  ),
  text(
    100,
    "Мем «ты не пройдёшь» родился из сцены, где седой волшебник с посохом преграждает путь огнедышащему существу на мосту. Из какой кинотрилогии этот кадр?",
    "Властелин колец",
    ["The Lord of the Rings", "LOTR", "Властелин Колец", "Lord of the Rings"],
  ),
  text(
    200,
    "Фраза «надо, Федя, надо» из советской комедии стала мемом. Из какого фильма она?",
    "Операция «Ы»",
    [
      "Операция Ы",
      "Операция «Ы» и другие приключения Шурика",
      "Операция Ы и другие приключения Шурика",
    ],
  ),

  // --- цитата / описание ---
  text(
    100,
    "В 2019 году в русскоязычном твиттере разлетелся мем, где коты среди ночи будят хозяйку, потому что всё уронили. Как обычно зовут хозяйку в этом меме?",
    "Наташа",
    ["Наташ", "Наташ, вставай", "Наташа, вставай, мы всё уронили"],
  ),
  text(
    200,
    "Как в мемах 2020-х прозвали каракала с пушистыми бакенбардами и очень серьёзной мордой, чьи фото разошлись по интернету?",
    "Большой Шлёпа",
    ["Шлёпа", "Big Floppa", "Floppa", "Большой Шлепа", "Шлепа"],
  ),
  text(
    200,
    "Какой фразой в рунете с 2018 года подписывают нелепые самоделки, будто хвастаясь ими перед основателем SpaceX и Tesla?",
    "Как тебе такое, Илон Маск?",
    [
      "Как тебе такое Илон Маск",
      "Как тебе такое, Илон Маск",
      "Как тебе такое, Илон?",
    ],
  ),
  text(
    300,
    "Как называют мем с рыбой, у которой вместо морды словно человеческое лицо и гипнотический взгляд?",
    "Язь",
    ["Язь — рыба моей мечты", "Язь рыба моей мечты", "Рыба язь"],
  ),
  text(
    300,
    "В этом меме четыре картинки мозга — от обычного до светящегося в космосе — показывают, как «умные» становятся идеи. Как мем называют?",
    "Расширяющийся мозг",
    ["Expanding brain", "Galaxy brain", "Galaxy Brain", "Expanding Brain"],
  ),
  text(
    200,
    "Какую фразу-мем 2012 года вспоминают, когда выпроваживают непрошеных гостей? В оригинальном ролике охранник так обратился к посетителям.",
    "Вы кто такие? Давайте до свидания",
    [
      "Ты кто такой? Давай до свидания",
      "Вы кто такие, давайте до свидания",
      "Давайте до свидания",
      "Ты кто такой, давай до свидания",
    ],
  ),

  // --- мем по эмодзи ---
  text(200, "Какой мем загадан этими эмодзи: 🌍👨🚀🔫?", "Always has been", [
    "Так было всегда",
    "Always Has Been",
    "It's always been",
    "Wait, it's all",
  ]),
  text(
    200,
    "Какой мем загадан эмодзи 😎, когда сверху на картинку падают тёмные очки под резкий звук?",
    "Deal with it",
    ["Deal With It", "Дил виз ит"],
  ),
  text(
    300,
    "Какой мем про гипермужественного человека с резкой челюстью загадан эмодзи 🧔💪😎?",
    "ГигаЧад",
    ["Giga Chad", "GigaChad", "Гигачад", "Giga chad"],
  ),
  text(
    400,
    "Какая игра и мем про озорную птицу загаданы эмодзи 🪿🌲?",
    "Untitled Goose Game",
    ["Безымянный гусь", "Гусь", "Untitled Goose", "Игра про гуся"],
  ),
];

async function main() {
  const supabase = getServiceSupabase();
  const existing = await loadExisting();
  const notes =
    "Новые категории 26.11.2026 — «Угадай мем»: звук (превью iTunes), откуда кадр, цитата/описание, эмодзи";
  const { data, error } = await supabase
    .from("question_packs")
    .insert({ status: "reviewing", source_notes: notes })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "pack_insert");
  const ok = await reviewDrafts(data.id as string, DRAFTS, {
    concurrency: 4,
    existing,
  });
  await supabase
    .from("question_packs")
    .update({
      status: ok ? "ready" : "failed",
      error: ok ? null : "empty_after_review",
    })
    .eq("id", data.id);
  console.log(`${notes} — pack ${data.id}: +${ok}/${DRAFTS.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
