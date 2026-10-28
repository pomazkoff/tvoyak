import "server-only";
import { getServiceSupabase } from "@/lib/supabase/admin";
import {
  completeOpenRouter,
  hasOpenRouter,
  OpenRouterMissingError,
  parseJson,
} from "@/lib/packs/openrouter";
import {
  calibrateValue,
  duplicateIndexes,
  safetyFlags,
  type DraftQuestion,
} from "@/lib/packs/review";
import { collectTrends } from "@/lib/packs/trends";

type ReviewPass = "safety" | "fact" | "freshness" | "difficulty" | "duplicates";

export async function buildPack(): Promise<{
  ok: boolean;
  packId: string;
  error?: string;
}> {
  const supabase = getServiceSupabase();
  const { data: created, error } = await supabase
    .from("question_packs")
    .insert({ status: "collecting" })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(error?.message ?? "pack_insert");
  }
  const packId = created.id as string;

  try {
    const trends = await collectTrends();
    await supabase
      .from("question_packs")
      .update({ source_notes: trends.notes, status: "reviewing" })
      .eq("id", packId);

    if (!hasOpenRouter()) throw new OpenRouterMissingError();

    const drafts = await generateQuestions(trends.topics);
    const existing = await loadExistingPrompts();
    const duplicates = new Set(
      duplicateIndexes(
        drafts.map((item) => item.prompt),
        existing,
      ),
    );

    const survivors: DraftQuestion[] = [];
    for (const [index, draft] of drafts.entries()) {
      const flags = safetyFlags(`${draft.prompt} ${draft.answer}`);
      if (flags.length || duplicates.has(index)) {
        const itemId = await insertItem(
          packId,
          { ...draft, value: calibrateValue(draft.value) },
          "rejected",
        );
        await addReview(
          packId,
          itemId,
          "safety",
          flags.length ? "failed" : "passed",
          flags.join(", "),
        );
        await addReview(
          packId,
          itemId,
          "duplicates",
          duplicates.has(index) ? "failed" : "passed",
          duplicates.has(index) ? "повтор" : "",
        );
        continue;
      }
      const reviewed = await reviewItem(draft);
      const value = calibrateValue(reviewed.value ?? draft.value);
      const rejected = reviewed.passes.some((pass) => pass.status === "failed");
      const itemId = await insertItem(
        packId,
        { ...draft, value, answer: reviewed.answer || draft.answer },
        rejected ? "rejected" : "draft",
        reviewed.agentMark,
      );
      for (const pass of reviewed.passes) {
        await addReview(packId, itemId, pass.pass, pass.status, pass.notes);
      }
      if (!rejected) survivors.push(draft);
    }

    await supabase
      .from("question_packs")
      .update({
        status: survivors.length ? "ready" : "failed",
        error: survivors.length ? null : "empty_after_review",
      })
      .eq("id", packId);
    return {
      ok: survivors.length > 0,
      packId,
      error: survivors.length ? undefined : "empty_after_review",
    };
  } catch (caught) {
    const reason =
      caught instanceof OpenRouterMissingError
        ? "openrouter_missing"
        : "pipeline_failed";
    await supabase
      .from("question_packs")
      .update({ status: "failed", error: reason })
      .eq("id", packId);
    return { ok: false, packId, error: reason };
  }
}

async function generateQuestions(topics: string[]): Promise<DraftQuestion[]> {
  const text = await completeOpenRouter(
    "Ты составитель «Своей игры» для компании в России. Пиши по-русски. Без политики, войны, выборов и тем 18+. Если человек — иноагент, добавь в формулировку пометку «(иноагент)». Верни только JSON-массив.",
    `Темы: ${topics.join("; ")}. Составь 8 коротких вопросов. Поля: category, prompt, answer, variants (массив строк), value (100–1000), kind ("text").`,
  );
  const parsed = parseJson<DraftQuestion[]>(text);
  return parsed
    .filter((item) => item && item.prompt && item.answer)
    .slice(0, 8)
    .map((item) => ({
      category: item.category || "Разное",
      prompt: item.prompt,
      answer: item.answer,
      variants: Array.isArray(item.variants) ? item.variants.map(String) : [],
      value: calibrateValue(Number(item.value)),
      kind: "text",
      curtain: false,
    }));
}

async function reviewItem(draft: DraftQuestion): Promise<{
  value: number;
  answer: string;
  agentMark: string | null;
  passes: Array<{
    pass: ReviewPass;
    status: "passed" | "failed" | "skipped";
    notes: string;
  }>;
}> {
  const passes: Array<{
    pass: ReviewPass;
    status: "passed" | "failed" | "skipped";
    notes: string;
  }> = [
    { pass: "safety", status: "passed", notes: "" },
    { pass: "duplicates", status: "passed", notes: "" },
  ];
  let value = draft.value;
  let answer = draft.answer;
  let agentMark: string | null = null;

  for (const pass of ["fact", "freshness", "difficulty"] as const) {
    try {
      const text = await completeOpenRouter(
        reviewSystem(pass),
        JSON.stringify(draft),
      );
      const verdict = parseJson<{
        ok?: boolean;
        notes?: string;
        value?: number;
        answer?: string;
        agent_mark?: string;
      }>(text);
      passes.push({
        pass,
        status: verdict.ok === false ? "failed" : "passed",
        notes: verdict.notes ?? "",
      });
      if (pass === "difficulty" && typeof verdict.value === "number")
        value = calibrateValue(verdict.value);
      if (typeof verdict.answer === "string" && verdict.answer.trim())
        answer = verdict.answer.trim();
      if (verdict.agent_mark) agentMark = String(verdict.agent_mark);
    } catch {
      passes.push({ pass, status: "skipped", notes: "проверка не ответила" });
    }
  }
  return { value, answer, agentMark, passes };
}

function reviewSystem(pass: ReviewPass): string {
  if (pass === "fact") {
    return 'Проверь факт. Верни JSON {"ok": true|false, "notes": "", "answer": "эталон если надо поправить"}.';
  }
  if (pass === "freshness") {
    return 'Вопрос должен быть понятен сейчас, не про вчерашнюю новость-однодневку и не про политику. Верни JSON {"ok": true|false, "notes": ""}.';
  }
  return 'Оцени сложность для компании. value только 100, 200, 300, 400, 500, 600, 800 или 1000. Верни JSON {"ok": true, "value": 300, "notes": ""}. Если человек иноагент, добавь agent_mark.';
}

async function loadExistingPrompts(): Promise<string[]> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("question_bank")
    .select("prompt")
    .limit(2000);
  return (data ?? []).map((row) => String((row as { prompt: string }).prompt));
}

async function insertItem(
  packId: string,
  draft: DraftQuestion,
  status: "draft" | "rejected",
  agentMark?: string | null,
): Promise<string> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("pack_items")
    .insert({
      pack_id: packId,
      category: draft.category,
      prompt: draft.prompt,
      answer: draft.answer,
      variants: draft.variants,
      value: draft.value,
      kind: draft.kind,
      curtain: draft.curtain,
      status,
      agent_mark: agentMark ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "item_insert");
  return data.id as string;
}

async function addReview(
  packId: string,
  itemId: string,
  pass: ReviewPass,
  status: "passed" | "failed" | "skipped",
  notes: string,
) {
  const supabase = getServiceSupabase();
  await supabase.from("pack_reviews").insert({
    pack_id: packId,
    item_id: itemId,
    pass,
    status,
    notes,
  });
}

export async function approvePack(
  packId: string,
): Promise<{ ok: boolean; copied: number; error?: string }> {
  const supabase = getServiceSupabase();
  const { data: items, error } = await supabase
    .from("pack_items")
    .select("category, prompt, answer, variants, kind, curtain")
    .eq("pack_id", packId)
    .eq("status", "draft");
  if (error) return { ok: false, copied: 0, error: "create_failed" };
  const rows = items ?? [];
  if (rows.length) {
    const { error: insertError } = await supabase.from("question_bank").insert(
      rows.map((row) => ({
        category: row.category,
        prompt: row.prompt,
        answer: row.answer,
        variants: row.variants,
        kind: row.kind,
        curtain: row.curtain,
      })),
    );
    if (insertError) return { ok: false, copied: 0, error: "create_failed" };
    await supabase
      .from("pack_items")
      .update({ status: "approved" })
      .eq("pack_id", packId)
      .eq("status", "draft");
  }
  await supabase
    .from("question_packs")
    .update({ status: "approved" })
    .eq("id", packId);
  return { ok: true, copied: rows.length };
}
