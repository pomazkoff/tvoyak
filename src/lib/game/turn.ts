import "server-only";
import { checkAgainstVariants, needsLlm } from "@/lib/answers/check";
import { isLlmCheckEnabled, judgeWithOpenRouter } from "@/lib/answers/llm";
import { priceWithinTolerance } from "@/lib/answers/price";
import { requireHostOrPhone } from "@/lib/game/host-auth";
import { answerFormatOk, isAnswerFormat } from "@/lib/game/surprises";
import { PICTURE_JUDGE_NOTE } from "@/lib/pictures/rules";
import { PRICE_CATEGORY, specialCategory } from "@/lib/packs/categories";
import { isPictureFormat } from "@/lib/pictures/types";
import { getServiceSupabase } from "@/lib/supabase/admin";

type Rpc = {
  ok?: boolean;
  error?: string;
  host_mode?: string;
  expected?: string;
  variants?: unknown;
  raw_text?: string;
  kind?: string;
  ready?: boolean;
  phase?: string;
  rows?: SheetRow[];
  prompt?: string;
  [key: string]: unknown;
};

type SheetRow = {
  player_id: string;
  nickname: string;
  raw_text: string;
  wager: number | null;
  suggestion_correct: boolean | null;
  method: string | null;
  verdict: string;
};

async function callRpc(
  name: string,
  args: Record<string, unknown>,
): Promise<Rpc> {
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    console.error(name, error.code ?? "rpc");
    return { ok: false, error: "rpc_failed" };
  }
  return (data ?? { ok: false, error: "rpc_failed" }) as Rpc;
}

function asVariants(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

type QuestionContext = {
  note: string | null;
  category: string | null;
  prompt: string | null;
};

/**
 * Тема и формат вопроса — чтобы подсказать судье, как принимать ответ
 * (картинки, «Сколько стоило?» с допуском ±20% и другие особые темы).
 */
async function questionContext(questionId: unknown): Promise<QuestionContext> {
  const empty = { note: null, category: null, prompt: null };
  if (typeof questionId !== "string") return empty;
  try {
    const { data } = await getServiceSupabase()
      .from("questions")
      .select("picture, category, prompt")
      .eq("id", questionId)
      .maybeSingle();
    const picture = data?.picture;
    const category = typeof data?.category === "string" ? data.category : null;
    const note = isPictureFormat(picture)
      ? PICTURE_JUDGE_NOTE[picture]
      : (specialCategory(category)?.judge ?? null);
    const prompt = typeof data?.prompt === "string" ? data.prompt : null;
    return { note, category, prompt };
  } catch {
    return empty;
  }
}

export async function judgeText(
  given: string,
  expected: string,
  variants: string[],
  loadContext?: () => Promise<QuestionContext>,
) {
  let context: QuestionContext | null = null;
  const loadOnce = async () => {
    if (!context && loadContext) context = await loadContext();
    return context;
  };
  // Цена: число в пределах ±20% от эталона — засчитано, дальше — нет.
  // Раньше нечёткой проверки: «25 копеек» и «20 копеек» отличаются одной
  // буквой, но это ошибка на 25%.
  if (/\d/.test(expected) && (await loadOnce())?.category === PRICE_CATEGORY) {
    // Дословное совпадение с эталоном или вариантом («450», «$499») —
    // засчитано сразу; опечатки здесь не прощаем, решает допуск.
    const exact = checkAgainstVariants(given, expected, variants);
    if (exact.correct && exact.method === "exact") {
      return { correct: true, method: "exact" as const };
    }
    const price = priceWithinTolerance(given, expected);
    if (price === true) return { correct: true, method: "fuzzy" as const };
    if (price === false) {
      const byVariant = variants.some(
        (variant) =>
          /\d/.test(variant) && priceWithinTolerance(given, variant) === true,
      );
      return { correct: byVariant, method: "fuzzy" as const };
    }
  }
  const local = checkAgainstVariants(given, expected, variants);
  if (local.correct) return { correct: true, method: local.method };
  // Раньше LLM спрашивали только про «похожие» строки (сходство ≥ 0.55), и
  // перевод, транслит или другое название («Stranger Things» на «Очень
  // странные дела») до него не доходили. Теперь — про всё, что не точно мимо.
  if (needsLlm(local) && isLlmCheckEnabled()) {
    const ctx = (await loadOnce()) as QuestionContext | null;
    try {
      const correct = await judgeWithOpenRouter({
        given,
        expected,
        variants,
        question: ctx?.prompt,
        category: ctx?.category,
        note: ctx?.note,
      });
      return { correct, method: "llm" as const };
    } catch {
      return { correct: false, method: "fuzzy" as const };
    }
  }
  return { correct: local.correct, method: local.method };
}

export async function submitPlayerAnswer(
  code: string,
  token: string,
  text: string,
) {
  const begun = await callRpc("begin_answer", {
    p_code: code,
    p_player_token: token,
    p_text: text,
  });
  if (begun.ok) {
    const raw = String(begun.raw_text ?? text);
    // «Сюрприз»: ответ только КАПСОМ / одним словом. Не тот формат —
    // неверно без проверки по смыслу (сервер всё равно это перепроверит).
    const format = isAnswerFormat(begun.format) ? begun.format : null;
    const verdict =
      format && !answerFormatOk(format, raw)
        ? { correct: false, method: "format" as const }
        : await judgeText(
            raw,
            String(begun.expected ?? ""),
            asVariants(begun.variants),
            () => questionContext(begun.question_id),
          );
    if (begun.host_mode === "bot") {
      const applied = await callRpc("apply_verdict", {
        p_code: code,
        p_correct: verdict.correct,
        p_method: verdict.method,
        p_player_id: begun.player_id ?? null,
      });
      return { ok: applied.ok !== false, error: applied.error, resolved: true };
    }
    await callRpc("note_suggestion", {
      p_code: code,
      p_correct: verdict.correct,
      p_method: verdict.method,
    });
    return { ok: true, judging: true };
  }

  if (begun.error !== "bad_phase" && begun.error !== "not_your_turn") {
    return {
      ok: false,
      error: begun.error ?? "rpc_failed",
      delta: typeof begun.delta === "number" ? begun.delta : undefined,
    };
  }

  const finalAnswer = await callRpc("begin_final_answer", {
    p_code: code,
    p_player_token: token,
    p_text: text,
  });
  if (!finalAnswer.ok)
    return { ok: false, error: finalAnswer.error ?? begun.error };
  if (finalAnswer.ready) {
    const settled = await settleFinal(code, null, false);
    return settled;
  }
  return { ok: true, waiting: true };
}

/**
 * Финал у бота подводит сервер: срок мог выйти (advance_clock), ответы
 * проверяются как обычно (fuzzy + LLM). Если вызвать некому — по сроку
 * tick_room сам подведёт итог нормализованным сравнением.
 */
export async function settleBotFinal(code: string) {
  await callRpc("advance_clock", { p_code: code });
  const sheet = await callRpc("final_sheet", { p_code: code });
  if (!sheet.ok) return { ok: false, error: sheet.error ?? "rpc_failed" };
  if (sheet.host_mode !== "bot") return { ok: false, error: "not_bot" };
  if (sheet.phase !== "judging") return { ok: true, waiting: true };
  return settleFinal(code, null, false);
}

async function loadFinalDecisions(code: string): Promise<
  | { ok: false; error?: string }
  | {
      ok: true;
      sheet: Rpc;
      decisions: Array<{ player_id: string; correct: boolean; method: string }>;
    }
> {
  const sheet = await callRpc("final_sheet", { p_code: code });
  if (!sheet.ok) return { ok: false, error: sheet.error };
  const rows = Array.isArray(sheet.rows) ? sheet.rows : [];
  const decisions: Array<{
    player_id: string;
    correct: boolean;
    method: string;
  }> = [];
  for (const row of rows) {
    if (row.verdict !== "pending") continue;
    if (
      row.suggestion_correct !== null &&
      row.suggestion_correct !== undefined
    ) {
      decisions.push({
        player_id: row.player_id,
        correct: row.suggestion_correct,
        method: row.method ?? "fuzzy",
      });
      continue;
    }
    const verdict = await judgeText(
      row.raw_text ?? "",
      String(sheet.expected ?? ""),
      asVariants(sheet.variants),
      () => questionContext(sheet.question_id),
    );
    decisions.push({
      player_id: row.player_id,
      correct: verdict.correct,
      method: verdict.method,
    });
  }
  return { ok: true, sheet, decisions };
}

export async function settleFinal(
  code: string,
  overrides: Array<{ playerId: string; correct: boolean }> | null,
  forceApply: boolean,
) {
  const loaded = await loadFinalDecisions(code);
  if (!loaded.ok) {
    return { ok: false, error: loaded.error ?? "rpc_failed" };
  }
  const { sheet, decisions } = loaded;
  if (sheet.phase !== "judging") {
    return { ok: true, waiting: true };
  }

  const merged = decisions.map((decision) => {
    const override = overrides?.find(
      (item) => item.playerId === decision.player_id,
    );
    if (!override) return decision;
    return {
      player_id: decision.player_id,
      correct: override.correct,
      method: override.correct === decision.correct ? decision.method : "host",
    };
  });

  if (sheet.host_mode === "human" && !forceApply) {
    await callRpc("mark_final_suggestions", { p_code: code, p_rows: merged });
    return {
      ok: true,
      judging: true,
      rows: merged.map((decision) => ({
        playerId: decision.player_id,
        correct: decision.correct,
        method: decision.method,
      })),
    };
  }

  const applied = await callRpc("apply_final", {
    p_code: code,
    p_rows: merged,
  });
  return { ok: applied.ok !== false, error: applied.error, resolved: true };
}

export async function hostAction(input: {
  action: string;
  code: string;
  hostSecret?: string;
  /** Телефон ведущего вместо ключа комнаты. */
  phoneToken?: string;
  correct?: boolean;
  questionId?: string;
  playerId?: string;
  decisions?: Array<{ playerId: string; correct: boolean }>;
}) {
  const auth = await requireHostOrPhone(input.code, {
    hostSecret: input.hostSecret,
    phoneToken: input.phoneToken,
  });
  if (!auth.ok) return { ok: false, error: auth.error };

  if (input.action === "voice") {
    // «Читать вопрос вслух» — общий флаг: его видят и экран, и телефон.
    const on = input.correct === true;
    const { error } = await auth.supabase
      .from("rooms")
      .update({ host_voice: on })
      .eq("id", auth.room.id);
    if (error) return { ok: false, error: "rpc_failed" };
    return { ok: true, host_voice: on };
  }

  if (input.action === "surprises") {
    // «Сюрпризы» включаются только в лобби: клетки отмечает start_game.
    const on = input.correct === true;
    if (auth.room.status !== "lobby") return { ok: false, error: "bad_phase" };
    const { error } = await auth.supabase
      .from("rooms")
      .update({ surprises: on })
      .eq("id", auth.room.id)
      .eq("status", "lobby");
    if (error) return { ok: false, error: "rpc_failed" };
    return { ok: true, surprises: on };
  }

  // Ленивый шаг серверных часов: просроченный срок закрывается до хода ведущего.
  if (
    input.action !== "start" &&
    input.action !== "clue" &&
    input.action !== "media_start"
  ) {
    await callRpc("advance_clock", { p_code: input.code });
  }

  if (input.action === "start") {
    return callRpc("start_game", { p_code: input.code });
  }
  if (input.action === "open_buzz") {
    return callRpc("open_buzz", { p_code: input.code });
  }
  if (input.action === "pass") {
    return callRpc("pass_question", { p_code: input.code });
  }
  if (input.action === "continue") {
    return callRpc("continue_game", { p_code: input.code });
  }
  if (input.action === "clue") {
    return callRpc("host_sheet", { p_code: input.code });
  }
  if (input.action === "judge") {
    return callRpc("apply_verdict", {
      p_code: input.code,
      p_correct: input.correct === true,
      p_method: "host",
      p_player_id: input.playerId ?? null,
    });
  }
  if (input.action === "finalize") {
    return settleFinal(input.code, input.decisions ?? null, true);
  }
  if (input.action === "media_start") {
    // Ведущий включил трек/видео на общем экране — телефоны «не у экрана»
    // стартуют с той же секунды.
    return callRpc("mark_media_started", { p_code: input.code });
  }
  if (input.action === "media_cue") {
    return callRpc("set_host_starts_media", {
      p_code: input.code,
      p_on: input.correct === true,
    });
  }
  if (input.action === "surprise_choose") {
    // «Выбор хода»: ведущий назначает, кто выберет следующую клетку.
    if (!input.playerId) return { ok: false, error: "player_not_found" };
    return callRpc("host_surprise_choose", {
      p_code: input.code,
      p_target_id: input.playerId,
    });
  }
  if (input.action === "pick") {
    // Ведущий (живой или бот) может выбрать клетку за игрока — например,
    // когда у выбирающего отвалился телефон.
    if (!input.questionId) return { ok: false, error: "bad_cell" };
    const picked = await callRpc("host_pick_cell", {
      p_code: input.code,
      p_question_id: input.questionId,
    });
    if (picked.ok !== true && picked.error === "rpc_failed") {
      return { ok: false, error: "pick_failed" };
    }
    return picked;
  }
  return { ok: false, error: "bad_phase" };
}
