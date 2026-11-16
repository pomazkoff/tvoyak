/**
 * Пополнение 16.11.2026: текстовые вопросы по свежим трендам осени 2026
 * (игры, кинопрокат, чарт Яндекс Музыки), написанные вручную по открытым
 * источникам (VGC, kinobusiness/kinometro, kinoscan, intermedia/UpSound), —
 * генератор grow-bank.ts дал в основном «вечные» вопросы. Черновики проходят
 * тот же reviewDrafts и ложатся пачкой в question_packs: в банк попадают
 * только после «Принять в пул» на /admin.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-16-trend-texts.ts
 */
import { loadExisting, reviewDrafts } from "@/lib/packs/pipeline";
import type { DraftQuestion } from "@/lib/packs/review";
import { getServiceSupabase } from "@/lib/supabase/admin";

const q = (category: string, value: number, prompt: string, answer: string, variants: string[] = []) =>
  ({ category, prompt, answer, variants, value, kind: "text" }) as DraftQuestion;

const DRAFTS: DraftQuestion[] = [
  q("Игры", 200, "Релиз этой игры Rockstar назначен на 19 ноября 2026 года — только для PS5 и Xbox Series, без версии для ПК. Что это за игра?", "GTA VI", ["Grand Theft Auto VI", "GTA 6", "ГТА 6"]),
  q("Игры", 300, "Приквел, вышедший 6 октября 2026 года: молодые Маркус Феникс и Доминик Сантьяго встречают день, когда Саранча впервые вышла на поверхность Серы. Назовите игру.", "Gears of War: E-Day", ["Gears of War E-Day", "E-Day", "Gears of War"]),
  q("Игры", 500, "Смертельно раненому герою по имени Соул дают всего 66 дней, чтобы раскрыть заговор. Как называется этот уся-экшен студии S-GAME, вышедший 29 октября 2026 года?", "Phantom Blade Zero", ["Phantom Blade 0", "Phantom Blade"]),
  q("Игры", 400, "Кампания этой части про войну на Корейском полуострове, а сама игра впервые в серии вышла на Nintendo Switch 2 (23 октября 2026). Назовите игру.", "Call of Duty: Modern Warfare 4", ["Modern Warfare 4", "MW4", "Call of Duty MW4"]),
  q("Игры", 300, "Ремейк этой игры 1998 года вышел на Nintendo Switch 2 5 ноября 2026 года. Назовите оригинальную игру.", "The Legend of Zelda: Ocarina of Time", ["Ocarina of Time", "Zelda: Ocarina of Time", "Окарина времени"]),
  q("Кино", 200, "Приквел о юном Хеймитче Эбернети выходит в российский прокат 26 ноября 2026 года. Как называется фильм?", "Голодные игры: Рассвет жатвы", ["Рассвет жатвы", "The Hunger Games: Sunrise on the Reaping", "Sunrise on the Reaping"]),
  q("Кино", 300, "Фильм Питера Фаррелли «Рокки — это я» (2026) — о том, как в середине 1970-х безвестный актёр пробивал собственный сценарий о боксёре. Какую реальную звезду играет Энтони Ипполито?", "Сильвестр Сталлоне", ["Сталлоне", "Sylvester Stallone"]),
  q("Кино", 300, "Российская биографическая лента «Лиля», вышедшая в ноябре 2026 года, рассказывает об отношениях Лили Брик и какого поэта?", "Владимир Маяковский", ["Маяковский"]),
  q("Кино", 400, "В новом фильме Дэвида Финчера по сценарию Квентина Тарантино Брэд Питт снова играет каскадёра Клиффа Бута. В каком фильме Тарантино 2019 года этот герой появился впервые?", "Однажды в… Голливуде", ["Однажды в Голливуде", "Once Upon a Time in Hollywood"]),
  q("Кино", 200, "Джонни Депп в ноябрьской премьере 2026 года сыграл самого известного скрягу из рождественской повести Диккенса. Как зовут этого героя?", "Скрудж", ["Эбенезер Скрудж", "Ebenezer Scrooge", "Scrooge"]),
  q("Чарты", 400, "Трек «ДИНАСТИЯ» с конца октября 2026 года держится на первом месте чарта Яндекс Музыки. Его исполняют madk1d и какой рэпер?", "VILLIAN", ["Виллиан", "Villian"]),
  q("Чарты", 300, "Какая певица, звезда 90-х, в ноябре 2026 года попала в топ-10 чарта Яндекс Музыки с треком «Ледяное сердце»?", "Татьяна Буланова", ["Буланова"]),
  q("Чарты", 200, "Какой дуэт осенью 2026 года держится в чарте Яндекс Музыки с песней «Лампочки»?", "ARTIK & ASTI", ["Artik and Asti", "Артик и Асти"]),
  q("Чарты", 300, "Чей трек «GAZ» входит в топ-20 чарта Яндекс Музыки в ноябре 2026 года? Подсказка: она же спела «Life».", "Zivert", ["Зиверт", "Юлия Зиверт"]),
];

async function main() {
  const supabase = getServiceSupabase();
  const existing = await loadExisting();
  const { data, error } = await supabase
    .from("question_packs")
    .insert({ status: "reviewing", source_notes: "Пополнение 16.11.2026 — тренды осени 2026 вручную: Игры, Кино, Чарты" })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "pack_insert");
  const ok = await reviewDrafts(data.id as string, DRAFTS, { concurrency: 4, existing });
  await supabase
    .from("question_packs")
    .update({ status: ok ? "ready" : "failed", error: ok ? null : "empty_after_review" })
    .eq("id", data.id);
  console.log(`trend pack ${data.id}: +${ok}/${DRAFTS.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
