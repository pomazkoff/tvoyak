/**
 * Пополнение банка по темам через тот же конвейер, что и cron-пачки:
 * генерация → безопасность, повторы, утечка → LLM fact/freshness/difficulty
 * → повторная утечка. Всё ложится ЧЕРНОВИКАМИ в question_packs/pack_items;
 * в банк попадает только после «Принять в пул» в /admin.
 *
 * Запуск (нужны SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY,
 * OPENROUTER_MODEL):
 *   npx tsx --conditions=react-server scripts/grow-bank.ts [media.json ...]
 * Переменная GROW_ONLY="Кино,Игры" ограничивает темы.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import {
  generateForCategory,
  loadExisting,
  reviewDrafts,
} from "@/lib/packs/pipeline";
import type { DraftQuestion } from "@/lib/packs/review";
import { calibrateValue } from "@/lib/packs/review";
import { collectTrendSources, topicsFrom } from "@/lib/packs/trend-sources";
import { getServiceSupabase } from "@/lib/supabase/admin";

type Theme = { category: string; brief: string };

/** Пачки по 3–4 темы — так их удобно просматривать в /admin. */
const PACKS: Theme[][] = [
  [
    {
      category: "Кино",
      brief:
        "известные фильмы, актёры, режиссёры, кассовые хиты, российское и мировое кино",
    },
    {
      category: "Сериалы",
      brief:
        "популярные сериалы (российские и зарубежные), персонажи, стриминги",
    },
    {
      category: "Мультфильмы",
      brief:
        "мультфильмы и мультсериалы — Pixar, Disney, Союзмультфильм, «Смешарики», аниме не трогать",
    },
  ],
  [
    {
      category: "Игры",
      brief: "видеоигры, консоли, игровые персонажи, киберспорт",
    },
    {
      category: "Технологии",
      brief: "гаджеты, приложения, интернет-сервисы, IT-компании, термины",
    },
    {
      category: "Соцсети",
      brief: "соцсети и мессенджеры, их функции, тренды, история",
    },
    {
      category: "Блогеры",
      brief: "известные российские и мировые блогеры и стримеры (не политики)",
    },
  ],
  [
    {
      category: "Артисты",
      brief: "российские и зарубежные певцы и группы, их биографии и хиты",
    },
    {
      category: "Чарты",
      brief: "хиты, альбомы, музыкальные премии, рекорды стримингов",
    },
    {
      category: "YouTube",
      brief: "YouTube: рекорды, известные каналы, форматы, история платформы",
    },
    {
      category: "Мемы",
      brief: "интернет-мемы, фразы из мемов, вирусные ролики, их происхождение",
    },
  ],
  [
    {
      category: "Спорт",
      brief: "футбол, хоккей, теннис, Олимпиады, рекорды, известные спортсмены",
    },
    {
      category: "Места",
      brief: "достопримечательности, города и страны мира и России",
    },
    {
      category: "Еда и напитки",
      brief: "блюда разных кухонь, продукты, напитки (без алкоголя), фастфуд",
    },
  ],
  [
    {
      category: "Бренды",
      brief:
        "известные бренды и компании, логотипы словами, слоганы, история марок",
    },
    {
      category: "Автомобили",
      brief:
        "марки и модели машин, автоспорт, устройство автомобиля простыми словами",
    },
    {
      category: "Животные",
      brief: "необычные факты о животных, рекорды природы, домашние питомцы",
    },
  ],
  [
    {
      category: "Наука",
      brief:
        "наука простыми словами: физика, химия, биология, космос, изобретения",
    },
    {
      category: "Книги",
      brief:
        "известные книги, писатели, персонажи — школьная программа и бестселлеры, комиксы",
    },
    {
      category: "Аниме",
      brief: "популярные аниме и манга, персонажи, студии (без 18+)",
    },
  ],
  [
    {
      category: "Слова и сленг",
      brief:
        "современный сленг, значения слов, происхождение выражений, русский язык",
    },
    {
      category: "Хиты 2000-х",
      brief: "поп-культура 2000-х в России: песни, клипы, телешоу, гаджеты",
    },
    {
      category: "Искусство",
      brief: "известные картины, художники, музеи, скульптуры",
    },
  ],
  [
    {
      category: "Русский рэп",
      brief:
        "русский рэп и хип-хоп: артисты, альбомы, лейблы, баттлы (без мата, без иноагентов)",
    },
    {
      category: "Рок",
      brief:
        "русский и зарубежный рок и метал: группы, альбомы, фронтмены, легендарные концерты",
    },
    {
      category: "K-pop",
      brief: "K-pop: группы, фандомы, агентства, рекорды",
    },
    {
      category: "Саундтреки",
      brief:
        "музыка из кино, сериалов, игр и аниме: композиторы, песни из фильмов, «Оскар» за песню",
    },
  ],
  [
    {
      category: "Классика",
      brief: "классическая музыка: композиторы, оперы, балеты, инструменты",
    },
    {
      category: "Хиты 90-х",
      brief: "поп-музыка 90-х в России и мире: группы, клипы, евродэнс",
    },
    {
      category: "Советская эстрада",
      brief:
        "советская эстрада и ВИА: исполнители, песни из фильмов, «Песня года»",
    },
    {
      category: "Джаз и соул",
      brief: "джаз, блюз, соул и R&B: исполнители, стили, инструменты",
    },
    {
      category: "Электроника",
      brief: "электронная и танцевальная музыка: диджеи, фестивали, жанры",
    },
  ],
];

const TARGET = Number(process.env.GROW_TARGET ?? 26);
const PER_CALL = 12;
const MAX_CALLS = 5;

async function main() {
  const supabase = getServiceSupabase();
  const only = (process.env.GROW_ONLY ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const trends = topicsFrom(await collectTrendSources());
  const mediaFiles = process.argv.slice(2);

  if (mediaFiles.length) {
    // Одна пачка на файл: в /admin удобнее принимать музыку, картинки и
    // видео отдельно (и так же отдельно откатывать по pack_id).
    for (const file of mediaFiles) {
      const drafts = JSON.parse(readFileSync(file, "utf8")) as DraftQuestion[];
      const cats = [...new Set(drafts.map((draft) => draft.category))];
      const packId = await createPack(
        `Пополнение 29.10.2026 — медиа (${basename(file, ".json")}): ${drafts.length} вопросов; ${cats.join(", ")}`,
      );
      const ok = await reviewDrafts(
        packId,
        drafts.map((draft) => ({
          ...draft,
          value: calibrateValue(draft.value),
        })),
        { concurrency: 6 },
      );
      await finish(packId, ok);
      console.log(`media pack ${packId} (${file}): ${ok}/${drafts.length}`);
    }
    return;
  }

  for (const group of PACKS) {
    const themes = only.length
      ? group.filter((theme) => only.includes(theme.category))
      : group;
    if (!themes.length) continue;
    const packId = await createPack(
      `Пополнение 29.10.2026 — темы: ${themes.map((theme) => theme.category).join(", ")}`,
    );
    let total = 0;
    for (const theme of themes) {
      for (let call = 0; call < MAX_CALLS; call += 1) {
        const existing = await loadExisting();
        const have = existing.filter(
          (item) => item.category === theme.category,
        ).length;
        if (have >= TARGET) break;
        const avoid = existing
          .filter((item) => item.category === theme.category)
          .map((item) => item.answer);
        let drafts: DraftQuestion[] = [];
        try {
          drafts = await generateForCategory(
            theme.category,
            theme.brief,
            Math.min(PER_CALL, TARGET - have + 4),
            avoid,
            call === 0 ? trends : [],
          );
        } catch (error) {
          console.log(`  ${theme.category}: generation failed`, String(error));
          continue;
        }
        const ok = await reviewDrafts(packId, drafts, {
          concurrency: 6,
          existing,
        });
        total += ok;
        console.log(
          `  ${theme.category}: had ${have}, +${ok}/${drafts.length} (call ${call + 1})`,
        );
      }
    }
    await finish(packId, total);
    console.log(`pack ${packId}: +${total}`);
  }

  async function createPack(notes: string): Promise<string> {
    const { data, error } = await supabase
      .from("question_packs")
      .insert({ status: "reviewing", source_notes: notes })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "pack_insert");
    return data.id as string;
  }

  async function finish(packId: string, ok: number) {
    await supabase
      .from("question_packs")
      .update({
        status: ok ? "ready" : "failed",
        error: ok ? null : "empty_after_review",
      })
      .eq("id", packId);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
