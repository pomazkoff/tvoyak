/**
 * «Детский рисунок», 27.11.2026 (№ 113–119): наивные минималистичные рисунки
 * «как у ребёнка лет семи» по мотивам фильмов и мультфильмов — не дословные,
 * без текста, надписей, логотипов и копирования постеров. Рисуются встроенной
 * генерацией изображений бота (generateImage из bot/media), не платными API.
 *
 * Порядок:
 *   1. Нарисовать каждый пункт KIDS по полю draw (горизонтально, 4:3, белая
 *      бумага, цветные карандаши/фломастеры) и положить JPEG ~1024×768 в
 *      public/pictures/k/<file>.jpg — имя случайное и ответ не выдаёт.
 *   2. npx tsx --conditions=react-server scripts/refills/2026-11-27-kids.ts [--dry]
 *      — добавит в банк ВЫКЛЮЧЕННЫМИ (enabled=false) только те, у которых
 *      файл уже есть, и запишет SQL в scripts/refills/2026-11-27-kids.sql.
 *   Включает Илья на /admin/pictures (после выкладки картинок на сайт).
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getServiceSupabase } from "@/lib/supabase/admin";

type Kid = { file: string; answer: string; variants: string[]; hint: string; value: number; draw: string };

const KIDS: Kid[] = [
  { file: "b640f4181df8d7fc4f2a", answer: "Маша и Медведь", variants: ["Маша и медведь", "Masha and the Bear"], hint: "мультфильм", value: 200,
    draw: "a little girl in a pink headscarf sitting on the shoulders of a big friendly brown bear next to a small wooden hut in a pine forest" },
  { file: "871ac99265bf531ec573", answer: "Смешарики", variants: ["Smeshariki", "Kikoriki"], hint: "мультфильм", value: 200,
    draw: "several perfectly round ball-shaped cartoon animals — a blue rabbit, a purple hedgehog with glasses, a white sheep — playing together on a green hill" },
  { file: "5488c0fd94fa32e46a73", answer: "Фиксики", variants: ["The Fixies"], hint: "мультфильм", value: 300,
    draw: "two tiny people with a tuft of hair, in blue and orange overalls, repairing the inside of a big old TV with a huge screwdriver while a boy peeks in" },
  { file: "42dcfe38cd8ca4488057", answer: "Бэтмен", variants: ["Batman", "Тёмный рыцарь"], hint: "фильм", value: 300,
    draw: "a man in a black cape and mask with two pointy ears standing on a rooftop at night, a bat-shaped spotlight in the cloudy sky over a dark city" },
  { file: "5a6750f7fcc78e195e08", answer: "Трансформеры", variants: ["Transformers"], hint: "фильм", value: 300,
    draw: "a yellow sports car halfway turning into a giant robot, arms and legs unfolding from the car, standing on a road" },
  { file: "2bcdbf60597ab783015d", answer: "Мой сосед Тоторо", variants: ["Тоторо", "My Neighbor Totoro"], hint: "мультфильм", value: 400,
    draw: "a huge round grey forest creature with long ears holding a leaf over its head in the rain at a countryside bus stop, a small girl with a red umbrella beside it" },
  { file: "2ef79613d046c7d6d885", answer: "Годзилла", variants: ["Godzilla", "Годзила"], hint: "фильм", value: 300,
    draw: "an enormous green spiky dinosaur monster stomping through a city of tiny buildings by the sea, tiny helicopters around it" },
];

const FIRST_NUMBER = 113;
const CREDIT = "Рисунок нарисован ИИ для «Твояка»";
const LICENSE = "ИИ-рисунок (фан-арт)";

async function main() {
  const dry = process.argv.includes("--dry");
  const dir = join(process.cwd(), "public/pictures/k");
  const rows = KIDS.map((kid, index) => ({ kid, number: FIRST_NUMBER + index }))
    .filter(({ kid }) => {
      const ok = existsSync(join(dir, `${kid.file}.jpg`));
      if (!ok) console.log(`нет файла ${kid.file}.jpg — пропуск: ${kid.answer}`);
      return ok;
    })
    .map(({ kid, number }) => ({
      category: "Детский рисунок",
      prompt: `Детский рисунок № ${number}: ${kid.hint}.`,
      answer: kid.answer,
      variants: kid.variants,
      kind: "image",
      image_url: `/pictures/k/${kid.file}.jpg`,
      curtain: false,
      value: kid.value,
      picture: "kids",
      picture_spec: { effect: "blur" },
      reveal_seconds: 10,
      image_credit: CREDIT,
      image_license: LICENSE,
      image_page: null,
      enabled: false,
    }));
  if (!rows.length) return;
  const sql = [
    `-- «Детский рисунок», 27.11.2026 (№ ${rows[0]!.prompt.match(/№ (\d+)/)![1]}–…); ИИ-рисунки без текста и логотипов (встроенная генерация).`,
    "-- Аддитивно: задания ВЫКЛЮЧЕННЫМИ (enabled = false) — включает Илья на /admin/pictures.",
    "",
    "insert into public.question_bank (category, prompt, answer, variants, kind, image_url, curtain, value, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page, enabled) values",
    rows
      .map((row) => {
        const esc = (value: string) => `'${value.replaceAll("'", "''")}'`;
        const variants = `array[${row.variants.map(esc).join(", ")}]::text[]`;
        return `  (${esc(row.category)}, ${esc(row.prompt)}, ${esc(row.answer)}, ${variants}, 'image', ${esc(row.image_url)}, false, ${row.value}, 'kids', '{"effect":"blur"}'::jsonb, 10, ${esc(CREDIT)}, ${esc(LICENSE)}, null, false)`;
      })
      .join(",\n"),
    "on conflict (category, prompt) do nothing;",
    "",
  ].join("\n");
  writeFileSync(join(process.cwd(), "scripts/refills/2026-11-27-kids.sql"), sql);
  if (dry) return console.log(sql);
  const { error } = await getServiceSupabase()
    .from("question_bank")
    .upsert(rows, { onConflict: "category,prompt", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  console.log(`добавлено выключенными: ${rows.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
