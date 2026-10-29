/**
 * Собирает миграцию со стартовым банком картиночных заданий из bank.ts.
 * Каждое задание проходит те же проверки, что и в конвейере пачек
 * (checkPictureDraft): ребус читается ровно в ответ, все эмодзи есть в
 * Twemoji и отдают 200, файл Commons существует, лицензия свободная,
 * превью ?width=960 отдаёт 200. Не прошедшее в миграцию не попадает.
 *
 *   npx tsx scripts/picture-tasks/build-migration.ts [out.sql]
 */
import { writeFileSync } from "node:fs";
import { commonsImageUrl } from "@/lib/pictures/commons";
import {
  DEFAULT_REVEAL,
  PICTURE_CATEGORY,
  type PictureFormat,
} from "@/lib/pictures/types";
import { checkPictureDraft, type PictureDraft } from "@/lib/pictures/validate";
import { BLURS, EMOJI, FRAGMENTS, HIDDEN, LOGOS, REBUSES } from "./bank";

type Row = PictureDraft & { value: number };

const HIDDEN_HINT = "что здесь лишнее?";

function rows(): Row[] {
  const out: Row[] = [];
  const add = (
    format: PictureFormat,
    prompt: string,
    item: { answer: string; variants?: string[]; value: number },
    extra: Partial<Row>,
  ) =>
    out.push({
      category: PICTURE_CATEGORY[format],
      prompt,
      answer: item.answer,
      variants: item.variants ?? [],
      value: item.value,
      kind: "image",
      picture: format,
      reveal_seconds: DEFAULT_REVEAL[format],
      image_url: null,
      ...extra,
    });
  REBUSES.forEach((item, index) => {
    const letters = item.answer.length;
    add("rebus", `Ребус № ${index + 1}. Слово из ${letters} букв.`, item, {
      picture_spec: { parts: item.parts },
    });
  });
  EMOJI.forEach((item, index) =>
    add("emoji", `Эмодзи-шифр № ${index + 1}: ${item.hint}.`, item, {
      picture_spec: { lines: item.lines },
    }),
  );
  HIDDEN.forEach((item, index) =>
    add("hidden", `Найди лишнее № ${index + 1}: ${HIDDEN_HINT}`, item, {
      picture_spec: {
        base: item.base,
        odd: item.odd,
        cols: item.cols,
        rows: item.rows,
        seed: 101 + index * 37,
      },
    }),
  );
  const photo = (
    format: PictureFormat,
    title: string,
    list: Array<{
      answer: string;
      variants?: string[];
      value: number;
      file: string;
      hint: string;
      artist?: string;
      fx: object;
    }>,
  ) =>
    list.forEach((item, index) =>
      add(format, `${title} № ${index + 1}: ${item.hint}.`, item, {
        image_url: commonsImageUrl(item.file),
        picture_spec: item.fx,
        image_credit: item.artist ? `__ARTIST__${item.artist}` : null,
      }),
    );
  photo("fragment", "По фрагменту", FRAGMENTS);
  photo("blur", "Размытое фото", BLURS);
  photo("logo", "Логотип", LOGOS);
  return out;
}

function sql(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values: string[]): string {
  if (!values.length) return "'{}'::text[]";
  return `array[${values.map(sql).join(", ")}]::text[]`;
}

async function main() {
  const out =
    process.argv[2] ?? "supabase/migrations/20261029230100_picture_bank.sql";
  const all = rows();
  const ok: Row[] = [];
  const failed: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < all.length) {
      const row = all[next++]!;
      const manualArtist = row.image_credit?.startsWith("__ARTIST__")
        ? row.image_credit.slice("__ARTIST__".length)
        : null;
      const { problems, draft } = await checkPictureDraft<Row>({
        ...row,
        image_credit: null,
      });
      if (problems.length) {
        failed.push(`${row.category} / ${row.answer}: ${problems.join("; ")}`);
        continue;
      }
      if (manualArtist && draft.image_license) {
        draft.image_credit = `${manualArtist} · ${draft.image_license} · Wikimedia Commons`;
      }
      ok.push(draft as Row);
    }
  };
  await Promise.all(Array.from({ length: 2 }, worker));
  ok.sort(
    (a, b) =>
      a.category.localeCompare(b.category) ||
      a.value - b.value ||
      a.prompt.localeCompare(b.prompt, "ru", { numeric: true }),
  );

  const counts = new Map<string, number>();
  for (const row of ok)
    counts.set(row.category, (counts.get(row.category) ?? 0) + 1);

  const values = ok.map(
    (row) =>
      `  (${[
        sql(row.category),
        sql(row.prompt),
        sql(row.answer),
        sqlArray(row.variants),
        sql("image"),
        sql(row.image_url),
        "false",
        sql(row.value),
        sql(row.picture),
        `${sql(JSON.stringify(row.picture_spec))}::jsonb`,
        sql(row.reveal_seconds ? row.reveal_seconds : null),
        sql(row.image_credit),
        sql(row.image_license),
        sql(row.image_page),
      ].join(", ")})`,
  );
  const header = [
    "-- Стартовый банк картиночных заданий (собран scripts/picture-tasks/build-migration.ts).",
    "-- Все проверены: ребусы читаются ровно в ответ, эмодзи есть в Twemoji (CC-BY 4.0),",
    "-- фото и логотипы — файлы Wikimedia Commons со свободной лицензией или PD,",
    "-- ссылки Special:FilePath ?width=960 отдают 200. Автор и лицензия — в image_credit.",
    ...[...counts].map(([category, count]) => `--   ${category}: ${count}`),
    "",
  ].join("\n");
  const body = `insert into public.question_bank (category, prompt, answer, variants, kind, image_url, curtain, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page) values\n${values.join(",\n")}\non conflict (category, prompt) do nothing;\n`;
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
