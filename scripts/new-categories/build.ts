/**
 * Банк новых категорий → миграция (только insert … on conflict do nothing).
 *   text.json  — «Нейросеть пересказала», «Сколько стоило?», «Логика с
 *                подвохом», «Кто это сказал?», «Угадай по отзыву» (text.py)
 *   music.json — «Звук наоборот»: превью iTunes + audio_fx (itunes.py)
 *   video.json — «Голос из прошлого»: YouTube/VK с таймкодом под шторкой
 *   pictures.ts — «Один пиксель» и «Супер-зум»: файлы Commons (PD/свободные)
 * Каждый вопрос проходит leakCheck (ответ не в тексте), номинал 100–500;
 * картинки — checkPictureDraft (формат, лицензия Commons, превью 200).
 *
 *   npx tsx --conditions=react-server scripts/new-categories/build.ts [out.sql]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { leakCheck } from "@/lib/packs/review";
import { commonsImageUrl } from "@/lib/pictures/commons";
import { DEFAULT_REVEAL, PICTURE_CATEGORY } from "@/lib/pictures/types";
import { checkPictureDraft, type PictureDraft } from "@/lib/pictures/validate";
import { MACROS, PIXELS } from "./pictures";

type Row = {
  category: string;
  prompt: string;
  answer: string;
  variants: string[];
  value: number;
  kind: "text" | "image" | "video" | "music";
  curtain?: boolean;
  youtube_id?: string | null;
  vk_url?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  audio_url?: string | null;
  audio_fx?: string | null;
  image_url?: string | null;
  picture?: string | null;
  picture_spec?: unknown;
  reveal_seconds?: number | null;
  image_credit?: string | null;
  image_license?: string | null;
  image_page?: string | null;
  source?: string | null;
};

const DIR = "scripts/new-categories";

function load(name: string): Row[] {
  const path = `${DIR}/${name}`;
  return existsSync(path)
    ? (JSON.parse(readFileSync(path, "utf8")) as Row[])
    : [];
}

function pictureRows(): Row[] {
  const out: Row[] = [];
  PIXELS.forEach((item, index) =>
    out.push({
      category: PICTURE_CATEGORY.pixel,
      prompt: `Один пиксель № ${index + 1}: ${item.hint}.`,
      answer: item.answer,
      variants: item.variants ?? [],
      value: item.value,
      kind: "image",
      picture: "pixel",
      picture_spec: { effect: "pixel", blocks: item.blocks },
      reveal_seconds: DEFAULT_REVEAL.pixel,
      image_url: commonsImageUrl(item.file),
    }),
  );
  MACROS.forEach((item, index) =>
    out.push({
      category: PICTURE_CATEGORY.macro,
      prompt: `Супер-зум № ${index + 1}: ${item.hint}.`,
      answer: item.answer,
      variants: item.variants ?? [],
      value: item.value,
      kind: "image",
      picture: "macro",
      picture_spec: { mode: "zoom", focus: item.focus, scale: item.scale },
      reveal_seconds: DEFAULT_REVEAL.macro,
      image_url: commonsImageUrl(item.file),
    }),
  );
  return out;
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values: string[]): string {
  if (!values.length) return "'{}'::text[]";
  return `array[${values.map(sql).join(", ")}]::text[]`;
}

async function main() {
  const out =
    process.argv[2] ??
    "supabase/migrations/20261030070000_new_categories_bank.sql";
  const failed: string[] = [];
  const ok: Row[] = [];
  const all = [
    ...load("text.json"),
    ...load("music.json"),
    ...load("video.json"),
  ];
  for (const row of all) {
    const leak = leakCheck(row);
    if (leak.blocking)
      failed.push(`${row.category} / ${row.answer}: утечка ${leak.notes}`);
    else if (row.value < 100 || row.value > 500)
      failed.push(`${row.category} / ${row.answer}: номинал ${row.value}`);
    else ok.push(row);
  }
  const pictures = pictureRows();
  let next = 0;
  const worker = async () => {
    while (next < pictures.length) {
      const row = pictures[next++]!;
      const leak = leakCheck(row);
      const { problems, draft } = await checkPictureDraft<PictureDraft & Row>({
        ...row,
        image_credit: null,
      });
      if (leak.blocking) problems.push(`утечка ${leak.notes}`);
      if (problems.length) {
        failed.push(`${row.category} / ${row.answer}: ${problems.join("; ")}`);
        continue;
      }
      ok.push(draft as Row);
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker));

  const order = new Map(
    [
      "Нейросеть пересказала",
      "Сколько стоило?",
      "Логика с подвохом",
      "Кто это сказал?",
      "Угадай по отзыву",
      "Звук наоборот",
      "Голос из прошлого",
      "Один пиксель",
      "Супер-зум",
    ].map((name, index) => [name, index]),
  );
  ok.sort(
    (a, b) =>
      (order.get(a.category) ?? 99) - (order.get(b.category) ?? 99) ||
      a.value - b.value ||
      a.prompt.localeCompare(b.prompt, "ru", { numeric: true }),
  );
  const counts = new Map<string, number>();
  for (const row of ok)
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);

  const values = ok.map((row) => {
    const tuple = [
      sql(row.category),
      sql(row.prompt),
      sql(row.answer),
      sqlArray(row.variants),
      sql(row.kind),
      sql(Boolean(row.curtain)),
      sql(row.value),
      "true",
      sql(row.youtube_id),
      sql(row.vk_url),
      sql(row.start_seconds),
      sql(row.end_seconds),
      sql(row.audio_url),
      sql(row.audio_fx),
      sql(row.image_url),
      sql(row.picture),
      row.picture_spec
        ? `${sql(JSON.stringify(row.picture_spec))}::jsonb`
        : "null",
      sql(row.reveal_seconds || null),
      sql(row.image_credit),
      sql(row.image_license),
      sql(row.image_page),
    ].join(", ");
    const note = row.source
      ? `  -- источник: ${row.source.replaceAll("\n", " ")}\n`
      : "";
    return `${note}  (${tuple})`;
  });
  const header = [
    "-- Новые категории (собрано scripts/new-categories/build.ts). Только добавление.",
    "-- Факты сверены по источникам (в комментариях у вопросов), ответ не встречается",
    "-- в тексте вопроса (leakCheck), номинал 100–500 по сложности. Картинки —",
    "-- Wikimedia Commons, PD или свободная лицензия (проверено checkPictureDraft);",
    "-- музыка — только ссылки на 30-секундные превью iTunes, переворачиваются в",
    "-- браузере (Web Audio); видео — встраивание YouTube/VK с таймкодом под шторкой.",
    ...[...counts].map(([category, count]) => `--   ${category}: ${count}`),
    "",
  ].join("\n");
  const body = `insert into public.question_bank (category, prompt, answer, variants, kind, curtain, value, enabled, youtube_id, vk_url, start_seconds, end_seconds, audio_url, audio_fx, image_url, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page) values\n${values.join(",\n")}\non conflict (category, prompt) do nothing;\n`;
  writeFileSync(out, header + body);
  console.log(`written ${ok.length} rows to ${out}`);
  for (const [category, count] of counts)
    console.log(`  ${category}: ${count}`);
  if (failed.length) {
    console.log(`FAILED ${failed.length}:`);
    for (const line of failed) console.log(`  ${line}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
