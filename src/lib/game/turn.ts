import "server-only";
import { checkAgainstVariants } from "@/lib/answers/check";
import { isLlmCheckEnabled, judgeWithOpenRouter } from "@/lib/answers/llm";
import { requireHost } from "@/lib/game/host-auth";
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

export async function judgeText(
  given: string,
  expected: string,
  variants: string[],
) {
  const local = checkAgainstVariants(given, expected, variants);
  if (!local.correct && local.ambiguous && isLlmCheckEnabled()) {
    try {
      const hint = variants.length
        ? `${expected}. Также засчитай совпадение с: ${variants.join(", ")}`
        : expected;
      const correct = await judgeWithOpenRouter(given, hint);
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
    const verdict = await judgeText(
      String(begun.raw_text ?? text),
      String(begun.expected ?? ""),
      asVariants(begun.variants),
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
  hostSecret: string;
  correct?: boolean;
  questionId?: string;
  playerId?: string;
  decisions?: Array<{ playerId: string; correct: boolean }>;
}) {
  const auth = await requireHost(input.code, input.hostSecret);
  if (!auth.ok) return { ok: false, error: auth.error };

  // Ленивый шаг серверных часов: просроченный срок закрывается до хода ведущего.
  if (input.action !== "start" && input.action !== "clue") {
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
  if (input.action === "media_cue") {
    return callRpc("set_host_starts_media", {
      p_code: input.code,
      p_on: input.correct === true,
    });
  }
  if (input.action === "pick") {
    if (auth.room.host_mode !== "bot") {
      return { ok: false, error: "not_chooser" };
    }
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
