/**
 * Дополнительные написания правильных ответов для банка вопросов.
 *
 * Игроки пишут «Stranger Things» на «Очень странные дела», «Твиттер» на
 * «X», «АБС» на «Антиблокировочная система». Локальная проверка ловит
 * транслит, но не перевод и не другое название — для этого в variants
 * должны быть оригинальное/русское название, фамилия, сокращение.
 *
 * Скрипт берёт вопросы банка (bank.json — выгрузка id, category, prompt,
 * answer, variants), просит LLM предложить варианты, отсекает лишнее
 * (повторы, то, что и так засчитается локально, другие числа, слова из
 * текста вопроса, слишком общие) и пишет аддитивную миграцию SQL.
 *
 *   OPENROUTER_API_KEY=… npx tsx scripts/answer-variants/enrich.ts bank.json out.sql [proposals.json]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { checkAgainstVariants } from "@/lib/answers/check";
import { normalizeAnswer } from "@/lib/answers/normalize";
import { numberTokens } from "@/lib/answers/numbers";
import { promptContainsAnswer } from "@/lib/game/bank-leaks";

type BankRow = {
  id: string;
  category: string;
  prompt: string;
  answer: string;
  variants: string[] | null;
  picture?: string | null;
};

const SKIP_CATEGORIES = new Set(["Сколько стоило?"]);
// Ребус — «только то же слово», варианты ему не нужны.
const SKIP_PICTURES = new Set(["rebus"]);
// Отсеяно при ручной проверке: другое (группа вместо песни, мем вместо
// героини), хотя LLM предложил как «другое название».
const REJECTED = new Set(
  (
    JSON.parse(
      readFileSync(new URL("./rejected.json", import.meta.url), "utf8"),
    ) as Array<[string, string]>
  ).map(([answer, variant]) => `${answer}\u0000${variant}`),
);
const BATCH = 25;
const PARALLEL = 6;
const MAX_ADD = 5;

const SYSTEM = `Ты помогаешь вести банк вопросов русскоязычной викторины «Своя игра». Игроки — компания друзей в России, отвечают текстом, часто по-русски вместо английского и наоборот. Для каждого вопроса дай ДОПОЛНИТЕЛЬНЫЕ написания ПРАВИЛЬНОГО ответа, которые надо засчитать:
- оригинальное название латиницей для русского эталона и русское — для латинского: фильмы, сериалы, мультфильмы, игры, песни, группы, исполнители, бренды, сервисы, клубы (официальный русский прокат/перевод и оригинал);
- распространённые русские транслитерации («Вотсап», «Ватсап» для WhatsApp);
- для человека — фамилию (если по ней однозначно), полное имя, известный псевдоним или настоящее имя;
- общепринятое сокращение или аббревиатуру и её расшифровку («ABS», «АБС»; «ЛЧ»);
- старое или новое официальное название («Твиттер» для X; «Big Hit» для HYBE).
НЕ добавляй: другие правильные-по-смыслу, но другие объекты; более общие слова и родовые понятия («сериал», «певица»); части слова; похожие, но другие вещи; синонимы, которые подошли бы и к другому ответу; английский перевод обычных русских слов (животные, предметы, понятия), если по-английски так никто не ответит; варианты, которые есть в тексте вопроса.
Не повторяй эталон и уже имеющиеся варианты, даже другим регистром. Не больше ${MAX_ADD} вариантов, лучше меньше. Если добавлять нечего — пустой массив.
Ответ — только JSON: {"items":[{"n":номер,"add":["…"]}]}`;

async function ask(rows: BankRow[]): Promise<Map<number, string[]>> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY");
  const user = rows
    .map(
      (row, index) =>
        `${index + 1}. Тема: ${row.category}\nВопрос: ${row.prompt}\nЭталон: ${row.answer}\nУже есть: ${(row.variants ?? []).join("; ") || "—"}`,
    )
    .join("\n\n");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          signal: AbortSignal.timeout(120_000),
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash",
            temperature: 0.2,
            response_format: { type: "json_object" },
            messages: [
              { role: "system", content: SYSTEM },
              { role: "user", content: user },
            ],
          }),
        },
      );
      if (!response.ok) throw new Error(`OpenRouter ${response.status}`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = payload.choices?.[0]?.message?.content ?? "";
      const json = JSON.parse(
        text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1),
      ) as {
        items?: Array<{ n?: unknown; add?: unknown }>;
      };
      const out = new Map<number, string[]>();
      for (const item of json.items ?? []) {
        if (typeof item.n !== "number" || !Array.isArray(item.add)) continue;
        out.set(
          item.n - 1,
          item.add.filter((v): v is string => typeof v === "string"),
        );
      }
      return out;
    } catch (error) {
      console.error("batch failed", attempt, String(error));
    }
  }
  return new Map();
}

/** Оставляет только полезные и безопасные варианты. */
export function cleanVariants(row: BankRow, proposed: string[]): string[] {
  const existing = row.variants ?? [];
  const seen = new Set([row.answer, ...existing].map(normalizeAnswer));
  const answerNumbers = numberTokens(normalizeAnswer(row.answer))
    .sort()
    .join(" ");
  const kept: string[] = [];
  for (const raw of proposed) {
    const variant = raw.replace(/\s+/g, " ").trim();
    const normalized = normalizeAnswer(variant);
    if (!normalized || normalized.length < 2 || variant.length > 60) continue;
    if (seen.has(normalized)) continue;
    // Другое число — другой ответ («Гадкий я 3» к «Гадкий я 4»).
    const numbers = numberTokens(normalized).sort().join(" ");
    if (numbers && numbers !== answerNumbers) continue;
    // Слово из текста вопроса — подсказка, а не вариант.
    if (promptContainsAnswer(row.prompt, variant)) continue;
    // Первое слово составного ответа — обычно имя без фамилии («Татьяна»
    // к «Татьяна Дасковская», «Конан» к «Конан Дойл»): слишком общо.
    const words = normalized.split(" ");
    const isLeadingPart = [row.answer, ...existing].some((option) => {
      const optionWords = normalizeAnswer(option).split(" ");
      return (
        optionWords.length > words.length &&
        words.every((word, index) => optionWords[index] === word)
      );
    });
    if (isLeadingPart) continue;
    if (REJECTED.has(`${row.answer}\u0000${variant}`)) continue;
    // И так засчитается локально (транслит, опечатка) — не раздуваем банк.
    if (
      checkAgainstVariants(variant, row.answer, [...existing, ...kept]).correct
    ) {
      continue;
    }
    seen.add(normalized);
    kept.push(variant);
    if (kept.length >= MAX_ADD) break;
  }
  return kept;
}

function sqlText(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function main() {
  const [input, output, cache] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: enrich.ts bank.json out.sql");
  const bank = (JSON.parse(readFileSync(input, "utf8")) as BankRow[]).filter(
    (row) =>
      !SKIP_CATEGORIES.has(row.category) &&
      !SKIP_PICTURES.has(row.picture ?? ""),
  );
  const batches: BankRow[][] = [];
  for (let i = 0; i < bank.length; i += BATCH)
    batches.push(bank.slice(i, i + BATCH));

  // Третий аргумент — JSON с прошлыми предложениями LLM (id → варианты):
  // есть файл — LLM не спрашиваем, нет — спрашиваем и сохраняем туда.
  const cached =
    cache && existsSync(cache)
      ? (JSON.parse(readFileSync(cache, "utf8")) as Record<string, string[]>)
      : null;
  const fresh: Record<string, string[]> = {};
  const updates: Array<{ row: BankRow; add: string[] }> = [];
  let next = 0;
  async function worker() {
    while (next < batches.length) {
      const batch = batches[next++] ?? [];
      const proposals = cached
        ? new Map(batch.map((row, index) => [index, cached[row.id] ?? []]))
        : await ask(batch);
      if (!cached) {
        batch.forEach((row, index) => {
          fresh[row.id] = proposals.get(index) ?? [];
        });
      }
      batch.forEach((row, index) => {
        const proposed = proposals.get(index) ?? [];
        const add = cleanVariants(row, proposed);
        if (process.env.ENRICH_DEBUG && proposed.length) {
          console.error(
            `${row.answer} | ${JSON.stringify(row.variants)} | +${JSON.stringify(proposed)} => ${JSON.stringify(add)}`,
          );
        }
        if (add.length) updates.push({ row, add });
      });
      console.error(
        `batch ${next}/${batches.length}, updates ${updates.length}`,
      );
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, worker));
  updates.sort((a, b) => a.row.id.localeCompare(b.row.id));
  if (cache && !cached) writeFileSync(cache, JSON.stringify(fresh, null, 1));

  // Комментарий с эталоном — после запятой, иначе он её «съест».
  const values = updates
    .map(
      ({ row, add }, index) =>
        `  ('${row.id}', array[${add.map(sqlText).join(", ")}]::text[])${index < updates.length - 1 ? "," : ""} -- ${row.answer.replace(/\s+/g, " ")}`,
    )
    .join("\n");
  writeFileSync(
    output,
    `-- Дополнительные написания правильных ответов (scripts/answer-variants/enrich.ts):
-- оригинал/русское название, транслит, фамилия, сокращение, старое название.
-- Только добавляет: уже имеющиеся варианты и эталон не меняются, повторный
-- запуск ничего не дублирует.
update public.question_bank as b
set variants = coalesce(b.variants, '{}'::text[]) || array(
  select x from unnest(v.add) as x
  where not (lower(x) = any (select lower(y) from unnest(coalesce(b.variants, '{}'::text[]) || array[b.answer]) as y))
)
from (values
${values}
) as v(id, add)
where b.id = v.id::uuid;
`,
  );
  console.error(
    `rows updated: ${updates.length}, variants added: ${updates.reduce((n, u) => n + u.add.length, 0)}`,
  );
}

if (process.argv[1]?.endsWith("enrich.ts")) {
  void main();
}
