/**
 * Новые категории 27.11.2026 — «Супергерои» и «Мода и стиль».
 * Черновики сгенерировал обычный конвейер:
 *   GROW_ONLY="Супергерои,Мода и стиль" GROW_ADD=18 \
 *     npx tsx --conditions=react-server scripts/grow-bank.ts
 * (пачка «Пополнение 27.11.2026 — темы: Супергерои, Мода и стиль»).
 * Этот скрипт — ручная вычитка поверх LLM-ревью: убирает почти-дубли внутри
 * пачки и неточности, правит формулировки и номиналы, переименовывает пачку.
 * В банк (и в выбор тем) вопросы попадут только после «Принять в пул» на /admin.
 *
 *   npx tsx --conditions=react-server scripts/refills/2026-11-27-new-categories-review.ts
 */
import { getServiceSupabase } from "@/lib/supabase/admin";

const PACK = "7b3a56aa-766b-46cf-b350-0fce93f920b9";
const NOTES =
  "Новые категории 27.11.2026 — «Супергерои» и «Мода и стиль» (черновики, ручная вычитка)";

type Fix = {
  category: string;
  answer: string;
  /** Если вопросов с этим ответом несколько — по началу текста. */
  promptStart?: string;
  reject?: string;
  prompt?: string;
  value?: number;
  newAnswer?: string;
  variants?: string[];
};

const FIXES: Fix[] = [
  // «Мода и стиль»
  { category: "Мода и стиль", answer: "Плащ", reject: "почти дубль вопроса про тренчкот" },
  { category: "Мода и стиль", answer: "Платок", reject: "неверно: платок не «придуман в 1930-х»" },
  { category: "Мода и стиль", answer: "Met Gala", reject: "дубль вопроса «Мет Гала»" },
  { category: "Мода и стиль", answer: "Стритстайл", reject: "размытое определение, спорный ответ" },
  { category: "Мода и стиль", answer: "Ральф Лорен", reject: "неточно (джинсы и минимализм — это Calvin Klein), дубль описания" },
  { category: "Мода и стиль", answer: "Юбер де Живанши", reject: "неточно: трапеция — силуэт Ив Сен-Лорана для Dior" },
  {
    category: "Мода и стиль",
    answer: "Шанель",
    prompt:
      "Назовите фамилию француженки, основательницы модного дома, известного «маленьким чёрным платьем», твидовыми жакетами и логотипом из двух переплетённых букв C.",
    variants: ["Коко Шанель", "Chanel", "Габриэль Шанель"],
  },
  {
    category: "Мода и стиль",
    answer: "Вивьен Вествуд",
    prompt:
      "Эта британская дизайнер прославилась в 1970-х панк-модой и бутиком на Кингс-роуд, а позже — корсетами и клетчатыми коллекциями. Назовите её.",
  },
  { category: "Мода и стиль", answer: "Мет Гала", value: 300 },
  // «Супергерои»
  { category: "Супергерои", answer: "Поезд", reject: "дубль вопроса про Эй-Трейна" },
  { category: "Супергерои", answer: "Бэтмен", reject: "почти дубль вопроса про Брюса Уэйна" },
  {
    category: "Супергерои",
    answer: "Экспресс",
    newAnswer: "Эй-Трейн",
    variants: ["A-Train", "Поезд", "Поезд-А", "Экспресс", "Эй Трейн"],
    value: 400,
  },
  {
    category: "Супергерои",
    answer: "Нью-Йорк",
    prompt: "В каком городе живёт и защищает горожан Питер Паркер?",
    value: 200,
  },
  { category: "Супергерои", answer: "Гром", value: 300 },
  { category: "Супергерои", answer: "Скарлетт Йоханссон", value: 300 },
  { category: "Супергерои", answer: "Джокер", value: 200 },
  { category: "Супергерои", answer: "Танос", value: 300 },
  { category: "Супергерои", answer: "Ваканда", value: 400 },
];

async function main() {
  const supabase = getServiceSupabase();
  const { data: items, error } = await supabase
    .from("pack_items")
    .select("id, category, prompt, answer, status")
    .eq("pack_id", PACK);
  if (error || !items) throw new Error(error?.message ?? "items");
  for (const fix of FIXES) {
    const item = items.find(
      (row) =>
        row.category === fix.category &&
        row.answer === fix.answer &&
        row.status === "draft" &&
        (!fix.promptStart || row.prompt.startsWith(fix.promptStart)),
    );
    if (!item) {
      console.log("skip (нет черновика):", fix.category, fix.answer);
      continue;
    }
    if (fix.reject) {
      await supabase.from("pack_items").update({ status: "rejected" }).eq("id", item.id);
      await supabase.from("pack_reviews").insert({
        pack_id: PACK,
        item_id: item.id,
        pass: "fact",
        status: "failed",
        notes: `ручная вычитка 27.11: ${fix.reject}`,
      });
      console.log("rejected:", fix.answer, "—", fix.reject);
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (fix.prompt) patch.prompt = fix.prompt;
    if (fix.value) patch.value = fix.value;
    if (fix.newAnswer) patch.answer = fix.newAnswer;
    if (fix.variants) patch.variants = fix.variants;
    await supabase.from("pack_items").update(patch).eq("id", item.id);
    console.log("edited:", fix.answer, Object.keys(patch).join(","));
  }
  await supabase.from("question_packs").update({ source_notes: NOTES }).eq("id", PACK);
  const { data: left } = await supabase
    .from("pack_items")
    .select("category")
    .eq("pack_id", PACK)
    .eq("status", "draft");
  const count: Record<string, number> = {};
  for (const row of left ?? []) count[row.category] = (count[row.category] ?? 0) + 1;
  console.log("черновиков осталось:", count);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
