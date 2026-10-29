/**
 * «Детский рисунок»: наивные рисунки «как у ребёнка лет семи» по мотивам
 * известных фильмов и мультфильмов. Рисунки нарисованы ИИ (без текста,
 * надписей и логотипов, не копируют постер) и лежат в public/pictures/k/
 * под случайными именами — имя файла не выдаёт ответ.
 *
 *   npx tsx scripts/picture-tasks/kids.ts [1|2|3] [out.sql]
 *
 * 1 — первая волна (миграция 20261030010000_picture_kids.sql, номиналы
 * затем поправлены 20261030011000_picture_kids_values.sql), 2 — вторая волна
 * (20261030021000_picture_kids_wave2.sql), 3 — третья волна, новинки 2022–2026
 * (20261030030000_picture_kids_wave3.sql).
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

/**
 * Вторая волна — совсем минималистичные «каракули» (2–5 линий/фигур, одна
 * ключевая деталь), поэтому дороже: 300–500. Нумерация продолжает первую (№ 26+).
 */
export const KIDS_WAVE2: Kid[] = [
  {
    file: "47f16be0a06130bc86c0",
    answer: "Вверх",
    variants: ["Up"],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "93f9bae8524241f249b2",
    answer: "Аладдин",
    variants: ["Aladdin", "Аладин"],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "87fd892ce18247af33b8",
    answer: "Золушка",
    variants: ["Cinderella"],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "de5ddc4f7da1c8c4e72d",
    answer: "История игрушек",
    variants: ["Toy Story"],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "516f57587857e8fc8e19",
    answer: "Корпорация монстров",
    variants: ["Monsters, Inc.", "Корпорация Монстров"],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "a4b919d1fbdf7c62d1a6",
    answer: "Мадагаскар",
    variants: ["Madagascar", "Пингвины Мадагаскара"],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "1152a749f9897a1e8661",
    answer: "Кунг-фу Панда",
    variants: ["Кунг-фу панда", "Kung Fu Panda"],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "8e513ecc3745d169fa52",
    answer: "Бременские музыканты",
    variants: [],
    value: 300,
    hint: "мультфильм",
  },
  {
    file: "892b4cc71316d40add27",
    answer: "Приключения Буратино",
    variants: [
      "Буратино",
      "Золотой ключик",
      "Золотой ключик, или Приключения Буратино",
    ],
    value: 300,
    hint: "фильм / мультфильм",
  },
  {
    file: "3f6fc685903631a1eada",
    answer: "Властелин колец",
    variants: ["The Lord of the Rings", "Властелин колец: Братство кольца"],
    value: 400,
    hint: "фильм",
  },
  {
    file: "46d9aa817d1633e78030",
    answer: "Матрица",
    variants: ["The Matrix"],
    value: 400,
    hint: "фильм",
  },
  {
    file: "40f3940b72fd1f0326cc",
    answer: "Челюсти",
    variants: ["Jaws"],
    value: 400,
    hint: "фильм",
  },
  {
    file: "164641ce78796926374d",
    answer: "Красавица и Чудовище",
    variants: ["Красавица и чудовище", "Beauty and the Beast"],
    value: 400,
    hint: "мультфильм / фильм",
  },
  {
    file: "6ab45f795c04ee047253",
    answer: "ВАЛЛ-И",
    variants: ["ВАЛЛИ", "Валли", "WALL-E"],
    value: 400,
    hint: "мультфильм",
  },
  {
    file: "0135b92e570f7d77e46a",
    answer: "Кинг-Конг",
    variants: ["Кинг Конг", "King Kong"],
    value: 400,
    hint: "фильм",
  },
  {
    file: "fc55d4fa3c3e740ff686",
    answer: "Инопланетянин",
    variants: ["E.T.", "Пришелец", "Инопланетянин E.T."],
    value: 400,
    hint: "фильм",
  },
  {
    file: "bfaa4eae5eee9b03b381",
    answer: "Форрест Гамп",
    variants: ["Forrest Gump"],
    value: 400,
    hint: "фильм",
  },
  {
    file: "9a5cb21852bcdbec58d8",
    answer: "Ёжик в тумане",
    variants: ["Ежик в тумане"],
    value: 400,
    hint: "мультфильм",
  },
  {
    file: "ea4c5d2e7f295e62083b",
    answer: "Терминатор 2",
    variants: ["Терминатор", "Terminator", "Терминатор 2: Судный день"],
    value: 500,
    hint: "фильм",
  },
  {
    file: "c4d1ed2376f60fc93765",
    answer: "Назад в будущее",
    variants: ["Back to the Future"],
    value: 500,
    hint: "фильм",
  },
  {
    file: "26ddb264324e3e9167f3",
    answer: "Хатико",
    variants: ["Хатико: Самый верный друг", "Hachiko"],
    value: 500,
    hint: "фильм",
  },
  {
    file: "c9a1f0d31d3814be4123",
    answer: "Белое солнце пустыни",
    variants: [],
    value: 500,
    hint: "советский фильм",
  },
  {
    file: "5341fbfe79222c3e20b0",
    answer: "Пёс Барбос и необычный кросс",
    variants: ["Пес Барбос и необычный кросс", "Пёс Барбос"],
    value: 500,
    hint: "советский фильм",
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

export const KIDS_WAVE3: Kid[] = [
  {
    file: "ee58b8daa0fe506f0872",
    answer: "Барби",
    variants: ["Barbie"],
    value: 300,
    hint: "фильм-новинка",
  },
  {
    file: "b6dea126b0c91d964822",
    answer: "Головоломка 2",
    variants: ["Головоломка", "Inside Out 2"],
    value: 300,
    hint: "мультфильм-новинка",
  },
  {
    file: "4cf007c4ad3535c9815b",
    answer: "Моана 2",
    variants: ["Моана", "Moana 2"],
    value: 300,
    hint: "мультфильм-новинка",
  },
  {
    file: "e2956db44657e7530798",
    answer: "Гадкий я 4",
    variants: ["Despicable Me 4"],
    value: 300,
    hint: "мультфильм-новинка",
  },
  {
    file: "d2a0de207e68c5f8f0aa",
    answer: "Братья Супер Марио в кино",
    variants: ["Супер Марио", "Super Mario", "Марио"],
    value: 300,
    hint: "мультфильм-новинка",
  },
  {
    file: "b4ad57f4856c6dcd8286",
    answer: "Minecraft в кино",
    variants: ["Майнкрафт", "Minecraft", "Майнкрафт в кино"],
    value: 300,
    hint: "фильм-новинка",
  },
  {
    file: "0f1bfa12863f8fdaeda0",
    answer: "Зверополис 2",
    variants: ["Зверополис", "Zootopia 2"],
    value: 300,
    hint: "мультфильм-новинка",
  },
  {
    file: "cac66f5c2161125e837e",
    answer: "Лило и Стич",
    variants: ["Lilo & Stitch", "Лило и Стич (фильм)"],
    value: 300,
    hint: "фильм-новинка",
  },
  {
    file: "88e3d7ca4feca37328e8",
    answer: "Чебурашка 2",
    variants: ["Чебурашка"],
    value: 300,
    hint: "российский фильм-новинка",
  },
  {
    file: "c155fdda0fcb401ee12c",
    answer: "Летучий корабль",
    variants: ["Летучий корабль (фильм)"],
    value: 300,
    hint: "российский фильм-новинка",
  },
  {
    file: "6cba62d53a4c6977b309",
    answer: "Волшебник Изумрудного города",
    variants: [
      "Волшебник изумрудного города. Дорога из жёлтого кирпича",
      "Волшебник Изумрудного города. Дорога из желтого кирпича",
      "Изумрудный город",
    ],
    value: 300,
    hint: "российский фильм-новинка",
  },
  {
    file: "df3faf4f28edf0dc8a6b",
    answer: "Оппенгеймер",
    variants: ["Oppenheimer"],
    value: 400,
    hint: "фильм-новинка",
  },
  {
    file: "edbe34a72ad5b98add05",
    answer: "Топ Ган: Мэверик",
    variants: ["Топ Ган", "Top Gun: Maverick", "Топ Ган Мэверик"],
    value: 400,
    hint: "фильм-новинка",
  },
  {
    file: "fbdbb87683c8e9cce266",
    answer: "Аватар: Путь воды",
    variants: ["Аватар 2", "Avatar: The Way of Water", "Путь воды"],
    value: 400,
    hint: "фильм-новинка",
  },
  {
    file: "76b9ca9163abea18fa93",
    answer: "Дюна: Часть вторая",
    variants: ["Дюна", "Дюна 2", "Dune: Part Two"],
    value: 400,
    hint: "фильм-новинка",
  },
  {
    file: "fd4a7f8eaed151cb97c3",
    answer: "Злая",
    variants: ["Wicked", "Злая: Сказка о ведьме Запада"],
    value: 400,
    hint: "фильм-новинка",
  },
  {
    file: "f6be3859de9cc1706738",
    answer: "Дикий робот",
    variants: ["The Wild Robot"],
    value: 400,
    hint: "мультфильм-новинка",
  },
  {
    file: "70aea1e7c9ad2c4767c5",
    answer: "Дэдпул и Росомаха",
    variants: ["Дэдпул", "Дэдпул 3", "Deadpool & Wolverine"],
    value: 400,
    hint: "фильм-новинка",
  },
  {
    file: "5fad6975455105677514",
    answer: "Мастер и Маргарита",
    variants: ["Мастер и Маргарита (фильм)"],
    value: 400,
    hint: "российский фильм-новинка",
  },
  {
    file: "c1e355c0cd6d73cc01ba",
    answer: "Вызов",
    variants: ["Вызов (фильм)"],
    value: 400,
    hint: "российский фильм-новинка",
  },
  {
    file: "8a9509b32057f57a3d11",
    answer: "Холоп 2",
    variants: ["Холоп"],
    value: 400,
    hint: "российский фильм-новинка",
  },
  {
    file: "0a555e2cbc6e970c2d81",
    answer: "Сто лет тому вперёд",
    variants: ["100 лет тому вперёд", "Сто лет тому вперед"],
    value: 400,
    hint: "российский фильм-новинка",
  },
  {
    file: "4bb4c3eb508a57301050",
    answer: "Человек-паук: Паутина вселенных",
    variants: [
      "Паутина вселенных",
      "Через вселенные",
      "Человек-паук: Через вселенные 2",
      "Spider-Man: Across the Spider-Verse",
    ],
    value: 500,
    hint: "мультфильм-новинка",
  },
  {
    file: "61711130e480eda324ab",
    answer: "Майкл",
    variants: ["Michael"],
    value: 500,
    hint: "фильм-новинка",
  },
  {
    file: "d2c754d25d54d93ae8c9",
    answer: "Дьявол носит Prada 2",
    variants: [
      "Дьявол носит Прада 2",
      "Дьявол носит Prada",
      "The Devil Wears Prada 2",
    ],
    value: 500,
    hint: "фильм-новинка",
  },
  {
    file: "172a9811648d27acfd40",
    answer: "Одиссея",
    variants: ["The Odyssey"],
    value: 500,
    hint: "фильм-новинка",
  },
  {
    file: "373ffcbd43bb201b840f",
    answer: "Финист. Первый богатырь",
    variants: ["Финист", "Финист Ясный Сокол"],
    value: 500,
    hint: "российский фильм-новинка",
  },
  {
    file: "e54b489b9e1824e24dcc",
    answer: "Алиса в Стране чудес",
    variants: ["Алиса в стране чудес", "Алиса"],
    value: 500,
    hint: "российский фильм-новинка",
  },
  {
    file: "fc2bce5caa72b4b226d2",
    answer: "Сказка о царе Салтане",
    variants: ["Царь Салтан", "Салтан"],
    value: 500,
    hint: "российский фильм-новинка",
  },
  {
    file: "934babf4f97aa59b54b5",
    answer: "Последний богатырь. Колобок",
    variants: ["Последний богатырь", "Колобок"],
    value: 500,
    hint: "российский фильм-новинка",
  },
];

export type KidsWave = 1 | 2 | 3;

/** Все задания формата: волна 1 — № 1–25, волна 2 — № 26–48, волна 3 — № 49–78. */
function waveOf(index: number): KidsWave {
  if (index < KIDS.length) return 1;
  return index < KIDS.length + KIDS_WAVE2.length ? 2 : 3;
}

export function kidsRows(
  waves: KidsWave[] = [1, 2, 3],
): Array<PictureDraft & { value: number }> {
  return [...KIDS, ...KIDS_WAVE2, ...KIDS_WAVE3]
    .map((item, index) => ({
      category: PICTURE_CATEGORY.kids,
      prompt: `Детский рисунок № ${index + 1}: ${item.hint}.`,
      answer: item.answer,
      variants: item.variants,
      value: item.value,
      kind: "image" as const,
      picture: "kids" as const,
      picture_spec: { effect: "blur" as const },
      reveal_seconds: DEFAULT_REVEAL.kids,
      image_url: `/pictures/k/${item.file}.jpg`,
      image_credit: KIDS_CREDIT,
      image_license: "ИИ-рисунок (фан-арт)",
      image_page: null,
    }))
    .filter((_row, index) => waves.includes(waveOf(index)));
}

async function main() {
  const arg = process.argv[2];
  const wave: KidsWave = arg === "3" ? 3 : arg === "2" ? 2 : 1;
  const out =
    process.argv[3] ??
    (wave === 3
      ? "supabase/migrations/20261030030000_picture_kids_wave3.sql"
      : wave === 2
        ? "supabase/migrations/20261030021000_picture_kids_wave2.sql"
        : "supabase/migrations/20261030010000_picture_kids.sql");
  const rows = kidsRows([wave]);
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
  const header =
    wave === 3
      ? `-- «Детский рисунок», третья волна (собрана scripts/picture-tasks/kids.ts 3).
-- Новинки 2022–2026: российские и мировые фильмы и мультфильмы. Смесь детских
-- (300) и минималистичных (400–500) ИИ-рисунков без текста и логотипов;
-- start_game ставит их на дорогие клетки.
-- Аддитивно: добавляем ${rows.length} заданий (enabled = true).
`
      : wave === 2
        ? `-- «Детский рисунок», вторая волна (собрана scripts/picture-tasks/kids.ts 2).
-- Совсем минималистичные ИИ-рисунки (2–5 линий/фигур, одна ключевая деталь),
-- без текста и логотипов; номиналы 300–500 — start_game ставит их на дорогие клетки.
-- Аддитивно: добавляем ${rows.length} заданий (enabled = true).
`
        : `-- Формат «Детский рисунок» (собран scripts/picture-tasks/kids.ts).
-- Наивные рисунки по мотивам известных фильмов и мультфильмов нарисованы ИИ,
-- без текста и логотипов; файлы — public/pictures/k/<случайное имя>.jpg.
-- Аддитивно: расширяем список форматов и добавляем ${rows.length} заданий (enabled = true).

alter table public.question_bank drop constraint if exists question_bank_picture_check;
alter table public.question_bank add constraint question_bank_picture_check
  check (picture is null or picture in ('rebus', 'emoji', 'fragment', 'hidden', 'blur', 'logo', 'kids'));
`;
  const text = `${header}
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
