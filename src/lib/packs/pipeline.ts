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
  answerDuplicateIndexes,
  duplicateIndexes,
  leakCheck,
  safetyFlags,
  type DraftQuestion,
} from "@/lib/packs/review";
import {
  GENERATION_SYSTEM,
  generationUser,
  reviewSystem,
  themedGenerationUser,
  type ReviewPass,
} from "@/lib/packs/prompts";
import { collectTrends } from "@/lib/packs/trends";
import {
  PICTURE_GENERATION_SYSTEM,
  PICTURE_REVIEW_RULE,
  pictureGenerationUser,
} from "@/lib/pictures/generate";
import {
  DEFAULT_REVEAL,
  PICTURE_CATEGORY,
  isPictureFormat,
  type PictureFormat,
} from "@/lib/pictures/types";
import { checkPictureDraft } from "@/lib/pictures/validate";

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
    const survivors = await reviewDrafts(packId, drafts);

    await supabase
      .from("question_packs")
      .update({
        status: survivors ? "ready" : "failed",
        error: survivors ? null : "empty_after_review",
      })
      .eq("id", packId);
    return {
      ok: survivors > 0,
      packId,
      error: survivors ? undefined : "empty_after_review",
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

/**
 * Все проверки для готовых черновиков: безопасность, повторы (текст и
 * эталон в той же теме — против банка и других черновиков), утечка ответа,
 * затем LLM-проходы fact/freshness/difficulty и повторная проверка утечки.
 * Возвращает, сколько черновиков дошло до статуса draft.
 */
export async function reviewDrafts(
  packId: string,
  drafts: DraftQuestion[],
  options: { concurrency?: number; existing?: ExistingQuestion[] } = {},
): Promise<number> {
  const existing = options.existing ?? (await loadExisting());
  const duplicates = new Set([
    ...duplicateIndexes(
      drafts.map((item) => item.prompt),
      existing.map((item) => item.prompt),
    ),
    ...answerDuplicateIndexes(drafts, existing),
  ]);
  let survivors = 0;
  let next = 0;
  const worker = async () => {
    while (next < drafts.length) {
      const index = next++;
      let draft = drafts[index]!;
      // Картинки: формат, однозначность ребуса, эмодзи в Twemoji, свободная
      // лицензия и ответ 200 у ссылки — до любых LLM-проходов.
      let pictureNotes: string[] = [];
      if (draft.picture) {
        const checked = await checkPictureDraft(draft);
        draft = checked.draft;
        pictureNotes = checked.problems;
      }
      const flags = safetyFlags(`${draft.prompt} ${draft.answer}`);
      const leak = leakCheck(draft);
      if (
        flags.length ||
        duplicates.has(index) ||
        leak.blocking ||
        pictureNotes.length
      ) {
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
        await addReview(
          packId,
          itemId,
          "leak",
          leak.blocking ? "failed" : "passed",
          leak.notes,
        );
        if (draft.picture) {
          await addReview(
            packId,
            itemId,
            "picture",
            pictureNotes.length ? "failed" : "passed",
            pictureNotes.join("; "),
          );
        }
        continue;
      }
      const reviewed = await reviewItem(draft);
      const value = calibrateValue(reviewed.value ?? draft.value);
      // Факт-чекер мог поправить эталон — утечку проверяем ещё раз по итоговому.
      const finalLeak = leakCheck({
        ...draft,
        answer: reviewed.answer || draft.answer,
      });
      reviewed.passes.push({
        pass: "leak",
        status: finalLeak.blocking ? "failed" : "passed",
        notes: finalLeak.notes,
      });
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
      if (draft.picture) {
        await addReview(packId, itemId, "picture", "passed", "");
      }
      if (!rejected) survivors += 1;
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, options.concurrency ?? 1) }, worker),
  );
  return survivors;
}

/** Черновики на одну тему (для пополнения банка по темам). */
export async function generateForCategory(
  category: string,
  brief: string,
  count: number,
  avoidAnswers: string[],
  trends: string[] = [],
): Promise<DraftQuestion[]> {
  const text = await completeOpenRouter(
    GENERATION_SYSTEM,
    themedGenerationUser(category, brief, count, avoidAnswers, trends),
  );
  return parseJson<DraftQuestion[]>(text)
    .filter((item) => item && item.prompt && item.answer)
    .slice(0, count)
    .map((item) => ({
      category,
      prompt: String(item.prompt).trim(),
      answer: String(item.answer).trim(),
      variants: Array.isArray(item.variants) ? item.variants.map(String) : [],
      value: calibrateValue(Number(item.value)),
      kind: "text" as const,
      curtain: false,
    }));
}

/** Черновики картиночных заданий одного формата (проверяет reviewDrafts). */
export async function generatePictureDrafts(
  format: PictureFormat,
  count: number,
  avoidAnswers: string[],
): Promise<DraftQuestion[]> {
  const text = await completeOpenRouter(
    PICTURE_GENERATION_SYSTEM,
    pictureGenerationUser(format, count, avoidAnswers),
  );
  return parseJson<DraftQuestion[]>(text)
    .filter((item) => item && item.prompt && item.answer && item.picture_spec)
    .slice(0, count)
    .map((item) => ({
      category: PICTURE_CATEGORY[format],
      prompt: String(item.prompt).trim(),
      answer: String(item.answer).trim(),
      variants: Array.isArray(item.variants) ? item.variants.map(String) : [],
      value: calibrateValue(Number(item.value)),
      kind: "image" as const,
      curtain: false,
      picture: format,
      picture_spec: item.picture_spec,
      image_url:
        typeof item.image_url === "string" && item.image_url
          ? item.image_url
          : null,
      reveal_seconds:
        typeof item.reveal_seconds === "number"
          ? item.reveal_seconds
          : DEFAULT_REVEAL[format],
    }));
}

async function generateQuestions(topics: string[]): Promise<DraftQuestion[]> {
  const text = await completeOpenRouter(
    GENERATION_SYSTEM,
    generationUser(topics),
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
      const pictureRule = isPictureFormat(draft.picture)
        ? ` ${PICTURE_REVIEW_RULE[draft.picture]}`
        : "";
      const text = await completeOpenRouter(
        reviewSystem(pass) + pictureRule,
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

export type ExistingQuestion = {
  category: string;
  prompt: string;
  answer: string;
};

/** Банк и ещё не отклонённые черновики — чтобы пачки не повторяли друг друга. */
export async function loadExisting(): Promise<ExistingQuestion[]> {
  const supabase = getServiceSupabase();
  const [bank, drafts] = await Promise.all([
    supabase
      .from("question_bank")
      .select("category, prompt, answer")
      .limit(5000),
    supabase
      .from("pack_items")
      .select("category, prompt, answer")
      .eq("status", "draft")
      .limit(5000),
  ]);
  return [...(bank.data ?? []), ...(drafts.data ?? [])].map((row) => ({
    category: String(row.category),
    prompt: String(row.prompt),
    answer: String(row.answer),
  }));
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
      youtube_id: draft.youtube_id ?? null,
      image_url: draft.image_url ?? null,
      audio_url: draft.audio_url ?? null,
      start_seconds: draft.start_seconds ?? null,
      end_seconds: draft.end_seconds ?? null,
      media_note: draft.media_note ?? null,
      picture: draft.picture ?? null,
      picture_spec: draft.picture_spec ?? null,
      reveal_seconds: draft.reveal_seconds || null,
      image_credit: draft.image_credit ?? null,
      image_license: draft.image_license ?? null,
      image_page: draft.image_page ?? null,
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
    .select(
      "id, category, prompt, answer, variants, value, kind, curtain, youtube_id, image_url, audio_url, start_seconds, end_seconds, picture, picture_spec, reveal_seconds, image_credit, image_license, image_page",
    )
    .eq("pack_id", packId)
    .eq("status", "draft");
  if (error) return { ok: false, copied: 0, error: "create_failed" };
  // Последний рубеж: вопрос с ответом в тексте в банк не попадает,
  // даже если его вписали в черновик руками.
  const rows: NonNullable<typeof items> = [];
  for (const item of items ?? []) {
    const leak = leakCheck({
      category: item.category,
      prompt: item.prompt,
      answer: item.answer,
      variants: item.variants ?? [],
    });
    if (!leak.blocking) {
      rows.push(item);
      continue;
    }
    await supabase
      .from("pack_items")
      .update({ status: "rejected" })
      .eq("id", item.id);
    await addReview(packId, item.id, "leak", "failed", leak.notes);
  }
  if (rows.length) {
    const { error: insertError } = await supabase.from("question_bank").upsert(
      rows.map((row) => ({
        category: row.category,
        prompt: row.prompt,
        answer: row.answer,
        variants: row.variants,
        kind: row.kind,
        curtain: row.curtain,
        youtube_id: row.youtube_id,
        image_url: row.image_url,
        audio_url: row.audio_url,
        value: row.value,
        start_seconds: row.start_seconds,
        end_seconds: row.end_seconds,
        picture: row.picture,
        picture_spec: row.picture_spec,
        reveal_seconds: row.reveal_seconds || null,
        image_credit: row.image_credit,
        image_license: row.image_license,
        image_page: row.image_page,
        // Метка партии: откат — delete from question_bank where pack_id = …
        pack_id: packId,
      })),
      // Повтор уже существующего вопроса не валит одобрение всей пачки.
      { onConflict: "category,prompt", ignoreDuplicates: true },
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
