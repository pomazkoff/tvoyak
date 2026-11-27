/**
 * Пополнение 27.11.2026: текстовые и медиа-вопросы по трендам конца ноября 2026,
 * написанные вручную по открытым источникам: касса 19–22.11 (kinobusiness,
 * kinometro, intermedia, ЕАИС через business-gazeta), «Рождение империи» и
 * «Битва моторов» (ru.wikipedia), онлайн-премьеры недели (afisha.ru 24.11,
 * lenta.ru/tvmag об «Арсеньеве», трейлер Кинопоиска о «Тайном городе»),
 * номинанты The Game Awards 2026 (Polygon, Xbox Wire, Crunchyroll 17.11),
 * блог YouTube 24.11 о запуске GTA VI, чарт Яндекс Музыки 26.11 (UpSound,
 * intermedia 26.11). Генератор grow-bank.ts по тем же темам запущен отдельно
 * (GROW_ONLY="Кино,Сериалы,Игры,Чарты,YouTube" GROW_ADD=6).
 *
 * Медиа — только легальные превью: 30-секундные превью iTunes (audio-ssl,
 * трек не скачиваем) и встраивание YouTube с таймкодом (официальные каналы,
 * проверены oEmbed; фрагмент выбран по раскадровке так, чтобы в кадре не было
 * титра с названием).
 * Черновики проходят reviewDrafts (безопасность, повторы, утечка, LLM-факты)
 * и ложатся пачками в question_packs: в банк — только после «Принять в пул» на /admin.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-27-trend-texts.ts
 *   npx tsx --conditions=react-server scripts/refills/2026-11-27-trend-texts.ts --retry=<текст>,<медиа>
 */
import { loadExisting, reviewDrafts } from "@/lib/packs/pipeline";
import type { DraftQuestion } from "@/lib/packs/review";
import { getServiceSupabase } from "@/lib/supabase/admin";

const q = (category: string, value: number, prompt: string, answer: string, variants: string[] = []) =>
  ({ category, prompt, answer, variants, value, kind: "text", curtain: false }) as DraftQuestion;

const song = (value: number, prompt: string, answer: string, variants: string[], audio_url: string) =>
  ({ category: "Чарты", prompt, answer, variants, value, kind: "music", curtain: true, audio_url, start_seconds: 0, end_seconds: 30 }) as DraftQuestion;

const trailer = (value: number, prompt: string, answer: string, variants: string[], youtube_id: string, start: number, end: number) =>
  ({ category: "Трейлеры", prompt, answer, variants, value, kind: "video", curtain: false, youtube_id, start_seconds: start, end_seconds: end }) as DraftQuestion;

const TEXTS: DraftQuestion[] = [
  // Кино
  q("Кино", 200, "Кто сыграл Петра I в исторической драме «Рождение империи» — лидере российского проката четыре уик-энда подряд в ноябре 2026 года?", "Александр Горбатов", ["Горбатов"]),
  q("Кино", 300, "В «Рождении империи» (2026) Милош Бикович играет ближайшего соратника Петра I, «светлейшего князя». Кого именно?", "Александр Меншиков", ["Меншиков", "Меньшиков"]),
  q("Кино", 300, "Герои фильма «Битва моторов» (2026) с Юрой Борисовым и Иваном Янковским строят первый серийный российский автомобиль. Как называлась марка?", "Руссо-Балт", ["Руссо Балт", "Russo-Balt", "Руссобалт"]),
  q("Кино", 400, "В каком знаменитом ралли, начинавшемся в Петербурге, участвует автомобиль героев фильма «Битва моторов» (2026)?", "Ралли Монте-Карло", ["Монте-Карло", "Монте Карло"]),
  q("Кино", 300, "Байопик «Рокки — это я» (в прокате с 19 ноября 2026) о молодом Сильвестре Сталлоне снял режиссёр «Тупого и ещё тупее» и оскароносной «Зелёной книги». Кто он?", "Питер Фаррелли", ["Фаррелли", "Peter Farrelly"]),
  q("Кино", 400, "Фильм «Социальная расплата», вышедший в онлайне 24 ноября 2026 года, — продолжение «Социальной сети». Кто написал сценарии обеих картин, а вторую ещё и снял?", "Аарон Соркин", ["Соркин", "Aaron Sorkin"]),
  // Сериалы
  q("Сериалы", 200, "Сериал «Тайный город» (Кинопоиск и ТНТ, с 23 ноября 2026) о магической Москве — экранизация цикла романов какого писателя?", "Вадим Панов", ["Панов"]),
  q("Сериалы", 300, "28 ноября 2026 года в Okko выходит сериал об исследователе Дальнего Востока Владимире Арсеньеве. Какой народный артист России играет главную роль?", "Евгений Миронов", ["Миронов"]),
  q("Сериалы", 400, "Как звали охотника-гольда, проводника Владимира Арсеньева, — героя его книги, фильма Акиры Куросавы и нового сериала Okko (ноябрь 2026)?", "Дерсу Узала", ["Дерсу", "Дерсу Узало"]),
  q("Сериалы", 300, "В ноябре 2026 года Prime Video выпустил сериал «Бегущий по лезвию 2099». Какая обладательница «Оскара» за «Всё везде и сразу» играет в нём одну из главных ролей?", "Мишель Йео", ["Йео", "Michelle Yeoh"]),
  // Игры
  q("Игры", 300, "Среди шести номинантов на «Игру года» The Game Awards 2026 — ремейк игры Nintendo 1998 года, где Линк путешествует во времени с помощью музыкального инструмента. Как она называется?", "The Legend of Zelda: Ocarina of Time", ["Ocarina of Time", "Окарина времени", "Zelda: Ocarina of Time", "Зельда: Окарина времени"]),
  q("Игры", 400, "Номинант «Игры года» TGA 2026 Control Resonant — продолжение Control от финской студии, создавшей Max Payne и Alan Wake. Как она называется?", "Remedy Entertainment", ["Remedy", "Ремеди"]),
  q("Игры", 400, "Игру 007 First Light о молодом Джеймсе Бонде, номинанта «Игры года» TGA 2026, сделала датская студия — авторы серии Hitman. Назовите её.", "IO Interactive", ["IOI", "Ай-Оу Интерактив"]),
  q("Игры", 300, "В какой день декабря 2026 года объявят победителей The Game Awards? Назовите число.", "10 декабря", ["10", "Десятого декабря", "Десятое декабря"]),
  // Чарты
  q("Чарты", 300, "Какой трек VILLIAN и madk1d в конце ноября 2026 года держится на 1-м месте чарта Яндекс Музыки? Название — одно слово капслоком.", "ДИНАСТИЯ", ["Династия"]),
  q("Чарты", 400, "Трек «Не виновен», занимающий 2-е место в чарте Яндекс Музыки в конце ноября 2026 года, исполняют A-THIS 52 и какой рэпер?", "ICEGERGERT", ["Айсгергерт", "Icegergert"]),
  // YouTube
  q("YouTube", 300, "В ноябре 2026 года YouTube провёл 24-часовой глобальный стрим, добавил в эфиры пять тематических подарков (вроде «звёзд розыска») и эффект для Shorts — всё к выходу одной игры. Какой?", "GTA VI", ["Grand Theft Auto VI", "GTA 6", "ГТА 6", "Grand Theft Auto 6"]),
  q("YouTube", 400, "По данным YouTube, ролики с GTA VI в названии в день её выхода набрали более 3,5 млрд просмотров. А сколько миллиардов просмотров, по словам YouTube, у всей серии GTA на платформе — 90, 400 или 900?", "900", ["900 миллиардов", "900 млрд"]),
];

const MEDIA: DraftQuestion[] = [
  song(300, "Кто исполняет этот трек — он в топ-10 чарта Яндекс Музыки в конце ноября 2026 года?", "NAVAI", ["Навай"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/08/66/49/08664997-c4f4-1577-1fe7-01d546e786c7/mzaf_7223215932771642265.plus.aac.p.m4a"),
  song(400, "Этот трек дуэта исполнителей — в топ-10 Яндекс Музыки в конце ноября 2026 года. Назовите любого из исполнителей.", "NEMIGA", ["Немига", "Дорогой Дневник", "NEMIGA и Дорогой Дневник"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ab/2e/b0/ab2eb044-9b22-4ce8-e41f-63e75ccd8c7d/mzaf_6723238698496893247.plus.aac.p.m4a"),
  song(400, "Кто исполняет этот трек — в конце ноября 2026 года он в топ-3 чарта «Звука»?", "MIA BOYKA", ["Миа Бойка", "Мия Бойка", "Mia Boyka"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/0e/3a/c3/0e3ac355-a218-d4a9-0a5c-84c2649f5de3/mzaf_1258381619903469766.plus.aac.p.m4a"),
  song(300, "Как называется этот трек BEARWOLF — в конце ноября 2026 года он в топ-5 чарта «Звука»? Одно слово.", "Феникс", ["Phoenix"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/bc/6e/ff/bc6efff2-7b01-fa03-3f5c-25faee57d4a8/mzaf_11497029225289219628.plus.aac.p.m4a"),
  song(200, "Кто исполняет этот трек 2026 года — он снова поднимается в чарте Яндекс Музыки в конце ноября?", "Zivert", ["Зиверт", "Юлия Зиверт"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/f7/85/ca/f785ca36-3532-240e-8210-52231a8325f7/mzaf_6938330486579234259.plus.aac.p.m4a"),
  song(300, "Этот трек — в топ-3 Яндекс Музыки в конце ноября 2026 года. Назовите любого из двух исполнителей.", "Koss", ["Косс", "ПЛУТТО", "Плутто", "Koss и ПЛУТТО"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a6/48/75/a648756c-6d6c-0c1b-8507-6ff99c5c0d6c/mzaf_13827616201354520580.plus.aac.p.m4a"),
  trailer(300, "Трейлер какого сериала о магической Москве на экране? Премьера на Кинопоиске и ТНТ — 23 ноября 2026 года.", "Тайный город", [], "yj_z4NrphtY", 25, 44),
  trailer(400, "Трейлер какого исторического сериала Okko (премьера — 28 ноября 2026 года) на экране? Он назван по фамилии главного героя.", "Арсеньев", [], "Ks-h4GUQUr4", 25, 44),
  trailer(300, "Трейлер какого сериала Prime Video (ноябрь 2026) на экране? Это продолжение культовой фантастики 1982 и 2017 годов.", "Бегущий по лезвию 2099", ["Blade Runner 2099", "Бегущий по лезвию"], "1d4x_eSdqNc", 20, 38),
  trailer(400, "Трейлер какой игры Remedy — номинанта «Игры года» на The Game Awards 2026 — на экране?", "Control Resonant", ["Control 2", "Контрол Резонант", "Контрол"], "SqvAvOAd1VA", 8, 28),
  trailer(300, "Трейлер какой игры от авторов Hitman — номинанта «Игры года» на The Game Awards 2026 — на экране?", "007 First Light", ["First Light", "007: First Light", "Джеймс Бонд 007 First Light"], "trvIyyFt_MM", 25, 45),
];


/**
 * Повторная проверка (--retry=<текстовая пачка>,<медиа-пачка>): LLM-ревью
 * в первом проходе отбраковало часть вопросов с ложной «утечкой» (цитирует
 * ответ из variants или безобидную подсказку). Формулировки упрощены, явные
 * подсказки убраны; черновики дописываются в те же пачки и проходят тот же reviewDrafts.
 */
const RETRY_TEXTS: DraftQuestion[] = [
  q("Кино", 200, "Какой актёр сыграл главную роль — царя-реформатора — в фильме «Рождение империи», лидере российского проката ноября 2026 года?", "Александр Горбатов", ["Горбатов"]),
  q("Кино", 400, "В каком знаменитом автомобильном ралли участвует машина героев фильма «Битва моторов» (2026)?", "Ралли Монте-Карло", ["Монте-Карло", "Монте Карло"]),
  q("Кино", 400, "Кто написал сценарий фильма «Социальная сеть» (2010), а в 2026 году снял его продолжение «Социальная расплата»?", "Аарон Соркин", ["Соркин", "Aaron Sorkin"]),
  q("Игры", 300, "Какой ремейк классической игры Nintendo 1998 года номинирован на «Игру года» The Game Awards 2026?", "The Legend of Zelda: Ocarina of Time", ["Ocarina of Time", "Окарина времени", "Zelda: Ocarina of Time"]),
  q("Чарты", 400, "Какой рэпер вместе с A-THIS 52 исполняет трек «Не виновен» — № 2 чарта Яндекс Музыки в конце ноября 2026 года?", "ICEGERGERT", ["Айсгергерт", "Icegergert"]),
];

const RETRY_MEDIA: DraftQuestion[] = MEDIA.filter((draft) =>
  ["NAVAI", "Koss", "Феникс", "Zivert", "Тайный город", "Арсеньев", "Бегущий по лезвию 2099", "Control Resonant", "007 First Light"].includes(draft.answer),
).map((draft) => {
  if (draft.answer === "Арсеньев")
    return { ...draft, prompt: "Трейлер какого исторического сериала Okko (премьера — 28 ноября 2026 года) на экране?" };
  if (draft.answer === "Бегущий по лезвию 2099")
    return { ...draft, prompt: "Трейлер какого фантастического сериала Prime Video (премьера — ноябрь 2026) на экране?" };
  if (draft.answer === "Zivert") return { ...draft, variants: ["Зиверт"] };
  if (draft.answer === "Феникс") return { ...draft, variants: [] };
  if (draft.answer === "Control Resonant") return { ...draft, variants: ["Контрол Резонант"] };
  return draft;
});

async function retry(packId: string, drafts: DraftQuestion[], existing: Awaited<ReturnType<typeof loadExisting>>) {
  const ok = await reviewDrafts(packId, drafts, { concurrency: 4, existing });
  console.log(`retry pack ${packId}: +${ok}/${drafts.length}`);
}

async function pack(notes: string, drafts: DraftQuestion[], existing: Awaited<ReturnType<typeof loadExisting>>) {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("question_packs")
    .insert({ status: "reviewing", source_notes: notes })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "pack_insert");
  const ok = await reviewDrafts(data.id as string, drafts, { concurrency: 4, existing });
  await supabase
    .from("question_packs")
    .update({ status: ok ? "ready" : "failed", error: ok ? null : "empty_after_review" })
    .eq("id", data.id);
  console.log(`${notes} — pack ${data.id}: +${ok}/${drafts.length}`);
}

async function main() {
  const existing = await loadExisting();
  const again = process.argv.find((arg) => arg.startsWith("--retry="))?.slice(8);
  if (again) {
    const [textPack, mediaPack] = again.split(",");
    if (textPack) await retry(textPack, RETRY_TEXTS, existing);
    if (mediaPack) await retry(mediaPack, RETRY_MEDIA, existing);
    return;
  }
  await pack("Пополнение 27.11.2026 — тренды конца ноября 2026 вручную: Кино, Сериалы, Игры, Чарты, YouTube", TEXTS, existing);
  await pack("Пополнение 27.11.2026 — медиа (тренды конца ноября 2026): превью iTunes и трейлеры YouTube; Чарты, Трейлеры", MEDIA, existing);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
