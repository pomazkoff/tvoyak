/**
 * «Детский рисунок»: наивные рисунки «как у ребёнка лет семи» по мотивам
 * известных фильмов и мультфильмов. Рисунки нарисованы ИИ (без текста,
 * надписей и логотипов, не копируют постер) и лежат в public/pictures/k/
 * под случайными именами — имя файла не выдаёт ответ.
 *
 *   npx tsx scripts/picture-tasks/kids.ts [out.sql]
 */
import { writeFileSync } from "node:fs";
import {
  DEFAULT_REVEAL,
  KIDS_CREDIT,
  PICTURE_CATEGORY,
} from "@/lib/pictures/types";
import { checkPictureDraft, type PictureDraft } from "@/lib/pictures/validate";

type Kid = {
  /** Случайное имя файла в public/pictures/k/ (без .jpg). */
  file: string;
  answer: string;
  variants: string[];
  value: number;
  hint: string;
};

/**
 * Первая волна — самые дешёвые номиналы: 100, самые трудные — 200.
 * Следующие волны пойдут дороже (300–500).
 */
export const KIDS: Kid[] = [
  {
    file: "0d952d9a49a0fd877337",
    answer: "Титаник",
    variants: ["Titanic"],
    value: 100,
    hint: "фильм",
  },
  {
    file: "3599606f55f7317b3ccc",
    answer: "Король Лев",
    variants: ["The Lion King"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "0443adc56f437c7753c8",
    answer: "Чебурашка",
    variants: ["Крокодил Гена", "Чебурашка и крокодил Гена"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "7d27aa49d8e02e21cea9",
    answer: "Шрек",
    variants: ["Shrek"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "258517ce542dd2b6fcc7",
    answer: "Ну, погоди!",
    variants: ["Ну погоди"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "3ff346031be9ac1fb5c5",
    answer: "Винни-Пух",
    variants: ["Винни Пух", "Винни-Пух и все-все-все"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "c54d84b10022fa02ec09",
    answer: "Трое из Простоквашино",
    variants: [
      "Простоквашино",
      "Каникулы в Простоквашино",
      "Зима в Простоквашино",
    ],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "cf324a300d42ef82afea",
    answer: "Человек-паук",
    variants: ["Spider-Man", "Человек паук"],
    value: 100,
    hint: "фильм",
  },
  {
    file: "3df76bd4ef724dd62909",
    answer: "Гарри Поттер",
    variants: ["Harry Potter", "Гарри Поттер и философский камень"],
    value: 100,
    hint: "фильм",
  },
  {
    file: "fddced5854593e902993",
    answer: "Один дома",
    variants: ["Home Alone"],
    value: 100,
    hint: "фильм",
  },
  {
    file: "c8c962b99f6626b252ef",
    answer: "Пираты Карибского моря",
    variants: ["Pirates of the Caribbean"],
    value: 100,
    hint: "фильм",
  },
  {
    file: "6e6f63f5a1a327d01113",
    answer: "Тачки",
    variants: ["Cars"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "cd06fdd02b4fd56b3849",
    answer: "Холодное сердце",
    variants: ["Frozen"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "7da45ac485602cbb4e5d",
    answer: "Ледниковый период",
    variants: ["Ice Age"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "c9a0b8aa373fa7a941b0",
    answer: "Гадкий я",
    variants: ["Despicable Me", "Миньоны", "Minions"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "ab0d5e47a6269a52065b",
    answer: "Малыш и Карлсон",
    variants: [
      "Карлсон",
      "Карлсон вернулся",
      "Малыш и Карлсон, который живёт на крыше",
    ],
    value: 100,
    hint: "советский мультфильм",
  },
  {
    file: "49f1f2601b6ecafa568e",
    answer: "Иван Васильевич меняет профессию",
    variants: ["Иван Васильевич"],
    value: 100,
    hint: "советский фильм",
  },
  {
    file: "4088cc6e2c337b834f58",
    answer: "Бриллиантовая рука",
    variants: ["Брильянтовая рука"],
    value: 100,
    hint: "советский фильм",
  },
  {
    file: "7b8249597052341130b3",
    answer: "Ирония судьбы, или С лёгким паром!",
    variants: ["Ирония судьбы", "С лёгким паром"],
    value: 100,
    hint: "советский фильм",
  },
  {
    file: "51513175aebac726844c",
    answer: "Парк юрского периода",
    variants: ["Jurassic Park", "Мир юрского периода"],
    value: 100,
    hint: "фильм",
  },
  {
    file: "6622442964aa611d623c",
    answer: "В поисках Немо",
    variants: ["Finding Nemo", "Немо"],
    value: 100,
    hint: "мультфильм",
  },
  {
    file: "753d72d006cbe8375041",
    answer: "Звёздные войны",
    variants: ["Звездные войны", "Star Wars"],
    value: 200,
    hint: "фильм",
  },
  {
    file: "b50b592bafc8549b546b",
    answer: "Аватар",
    variants: ["Avatar"],
    value: 100,
    hint: "фильм",
  },
  {
    file: "159911d9dd186044b2f2",
    answer: "Брат",
    variants: ["Брат 2"],
    value: 100,
    hint: "российский фильм",
  },
  {
    file: "46c754cf6c02403f5d0f",
    answer: "Движение вверх",
    variants: [],
    value: 200,
    hint: "российский фильм о спорте",
  },
];

function sql(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlArray(values: string[]): string {
  if (!values.length) return "'{}'::text[]";
  return `array[${values.map(sql).join(", ")}]::text[]`;
}

export function kidsRows(): Array<PictureDraft & { value: number }> {
  return KIDS.map((item, index) => ({
    category: PICTURE_CATEGORY.kids,
    prompt: `Детский рисунок № ${index + 1}: ${item.hint}.`,
    answer: item.answer,
    variants: item.variants,
    value: item.value,
    kind: "image",
    picture: "kids",
    picture_spec: { effect: "blur" },
    reveal_seconds: DEFAULT_REVEAL.kids,
    image_url: `/pictures/k/${item.file}.jpg`,
    image_credit: KIDS_CREDIT,
    image_license: "ИИ-рисунок (фан-арт)",
    image_page: null,
  }));
}

async function main() {
  const out =
    process.argv[2] ?? "supabase/migrations/20261030010000_picture_kids.sql";
  const rows = kidsRows();
  const failed: string[] = [];
  for (const row of rows) {
    const { problems } = await checkPictureDraft(row);
    if (problems.length) failed.push(`${row.answer}: ${problems.join("; ")}`);
  }
  if (failed.length) {
    console.error(`FAILED ${failed.length}:\n  ${failed.join("\n  ")}`);
    process.exit(1);
  }
  const values = rows.map(
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
        sql(row.reveal_seconds),
        sql(row.image_credit),
        sql(row.image_license),
        sql(row.image_page),
      ].join(", ")})`,
  );
  const text = `-- Формат «Детский рисунок» (собран scripts/picture-tasks/kids.ts).
-- Наивные рисунки по мотивам известных фильмов и мультфильмов нарисованы ИИ,
-- без текста и логотипов; файлы — public/pictures/k/<случайное имя>.jpg.
-- Аддитивно: расширяем список форматов и добавляем ${rows.length} заданий (enabled = true).

alter table public.question_bank drop constraint if exists question_bank_picture_check;
alter table public.question_bank add constraint question_bank_picture_check
  check (picture is null or picture in ('rebus', 'emoji', 'fragment', 'hidden', 'blur', 'logo', 'kids'));

insert into public.question_bank (category, prompt, answer, variants, kind, image_url, curtain, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page) values
${values.join(",\n")}
on conflict (category, prompt) do nothing;
`;
  writeFileSync(out, text);
  console.log(`written ${rows.length} rows to ${out}`);
}

if (process.argv[1]?.endsWith("kids.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
