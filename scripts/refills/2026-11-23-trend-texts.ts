/**
 * Пополнение 23.11.2026: текстовые и медиа-вопросы по трендам ноября 2026
 * (GTA VI и игровые релизы ноября, кинопрокат 19–22.11, чарт Яндекс Музыки
 * ноября), написанные вручную по открытым источникам (Take-Two/AP/CNBC,
 * Blizzard News, GameSpot/GamesRadar, kinometro/vseznaika/culturavrn,
 * UpSound/intermedia). Генератор grow-bank.ts дал в основном «вечные» вопросы.
 * Медиа: превью iTunes (стабильные audio-ssl ссылки, проверены HEAD 200) и
 * трейлеры YouTube (проверены oEmbed, длительность — yt-dlp, фрагмент не
 * захватывает титры с названием). Черновики проходят тот же reviewDrafts и
 * ложатся пачками в question_packs: в банк попадают только после «Принять в
 * пул» на /admin.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-23-trend-texts.ts
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
  q("Игры", 200, "По данным Take-Two, эта игра Rockstar за первый день продаж, 19 ноября 2026 года, принесла 3,79 млрд долларов — рекорд для всех развлечений. Назовите игру.", "GTA VI", ["Grand Theft Auto VI", "GTA 6", "ГТА 6", "Grand Theft Auto 6"]),
  q("Игры", 400, "Главные герои GTA VI — криминальный дуэт Джейсона Дюваля и его подруги. Как её зовут?", "Лусия", ["Люсия", "Лючия", "Lucia", "Лусия Каминос"]),
  q("Игры", 300, "В каком вымышленном городе — аналоге Майами — разворачивается действие GTA VI?", "Вайс-Сити", ["Vice City", "Вайс Сити"]),
  q("Игры", 400, "4 ноября 2026 года Blizzard запустила «переосмысленный» Азерот для уровней 1–60 с новой расой Skyborne. Как называется проект?", "World of Warcraft: Forever", ["WoW: Forever", "WoW Forever", "World of Warcraft Forever"]),
  q("Игры", 300, "10 ноября 2026 года вышел ремастер игры 2004 года по мультфильму DreamWorks, где зелёный огр едет знакомиться с родителями жены. Назовите игру.", "Shrek 2", ["Шрек 2", "Shrek 2 Remastered"]),
  q("Кино", 200, "Лидер российского проката ноября 2026 года — историческая драма «Рождение империи»: от поражения под Нарвой до Полтавской битвы. Какой правитель в центре сюжета?", "Пётр I", ["Петр I", "Пётр Первый", "Петр Первый", "Пётр Великий"]),
  q("Кино", 300, "В фильме «Рождение империи» (2026) у Петра роман с Мартой Скавронской. Под каким именем она позже взошла на российский престол?", "Екатерина I", ["Екатерина Первая", "Екатерина Алексеевна"]),
  q("Кино", 200, "Комедия «Дедмобиль» (ноябрь 2026): шофёр Валера притворяется водителем беспилотного такси с ИИ, чтобы оплатить операцию своей собаке. Какой актёр, звезда «Городка», играет Валеру?", "Юрий Стоянов", ["Стоянов"]),
  q("Кино", 400, "Кто из актёров озвучил умное беспилотное такси в комедии «Дедмобиль» (2026)?", "Сергей Бурунов", ["Бурунов"]),
  q("Чарты", 300, "Сингл «Но забудь», вышедший 20 ноября 2026 года, сразу попал в топ-3 Яндекс Музыки. Это первая работа после долгой паузы у автора хита «Медуза». Кто он?", "MATRANG", ["Матранг", "Алан Хадзарагов"]),
  q("Чарты", 300, "Трек дуэта VILLIAN и madk1d из ноябрьского топ-10 Яндекс Музыки назван так же, как фильм 2002 года, где главную роль сыграл Эминем. Как называется трек?", "8 миля", ["8 Mile", "Восьмая миля"]),
  q("Чарты", 400, "Трек «ЗНАК», который в ноябре 2026 года держится в топ-5 чарта Яндекс Музыки, исполняют Toxi$ и какая певица?", "Дора", ["Dora", "Дарья Шиханова"]),
];

const MEDIA: DraftQuestion[] = [
  song(300, "Кто исполняет этот трек — новинку 20 ноября 2026 года, сразу ворвавшуюся в топ-3 Яндекс Музыки?", "MATRANG", ["Матранг", "Но забудь"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/1b/ff/1f/1bff1fff-0c43-3a64-5c0d-1db47f48c362/mzaf_14803919756102597629.plus.aac.p.m4a"),
  song(400, "Как называется этот трек — хит ноября 2026 года в чарте Яндекс Музыки? Название — одно слово.", "ЗНАК", ["Знак"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8e/71/c0/8e71c053-2ea2-4b17-ec93-ce515b1728ae/mzaf_18307262092983093504.plus.aac.p.m4a"),
  song(300, "Кто исполняет этот трек из топ-5 Яндекс Музыки ноября 2026 года?", "МАЯК X", ["Маяк Х", "Маяк X", "MAYAK X"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/d0/b9/7e/d0b97eaf-aa86-c8e3-10a2-928f79f40e17/mzaf_11904352797900351803.plus.aac.p.m4a"),
  song(200, "Эта песня 1998 года снова в топ-10 Яндекс Музыки в ноябре 2026-го. Кто её исполняет?", "Татьяна Буланова", ["Буланова"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/11/ba/e2/11bae2dd-57ca-08ee-5b3a-b446c087dd05/mzaf_208423502686258342.plus.aac.p.m4a"),
  song(400, "Кто исполняет этот трек из топ-10 Яндекс Музыки ноября 2026 года?", "ENZRO", ["Энзро"], "https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/50/74/45/50744535-f1cd-e838-370a-267b39aabcfe/mzaf_1023325056941196012.plus.aac.p.m4a"),
  trailer(200, "Трейлер какой игры на экране? Она вышла 19 ноября 2026 года и побила рекорды продаж.", "GTA VI", ["Grand Theft Auto VI", "GTA 6", "ГТА 6"], "QdBZY2fkU-0", 20, 38),
  trailer(300, "О создании какого фильма 1976 года рассказывает байопик из этого трейлера (в прокате с 19 ноября 2026)?", "Рокки", ["Rocky"], "lqvakShqeUc", 40, 60),
  trailer(200, "Из какого российского фильма — лидера проката ноября 2026 года — этот трейлер?", "Рождение империи", [], "9knMt2DLF_c", 25, 45),
  trailer(300, "Из какой российской комедии ноября 2026 года этот трейлер?", "Дедмобиль", [], "zxLMrgkBCvg", 20, 40),
];

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
  await pack("Пополнение 23.11.2026 — тренды ноября 2026 вручную: Игры, Кино, Чарты", TEXTS, existing);
  await pack("Пополнение 23.11.2026 — медиа (тренды ноября 2026): превью iTunes и трейлеры YouTube; Чарты, Трейлеры", MEDIA, existing);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
