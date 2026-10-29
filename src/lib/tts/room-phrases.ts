import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  TTS_MAX_CHARS,
  isAllowedPhrase,
  normalizeTtsText,
  parseVerdictPhrase,
} from "@/lib/tts/phrases";

/** Тексты, которые бот может произнести в этой комнате сейчас. */
export async function roomPhrases(
  supabase: SupabaseClient,
  roomId: string,
): Promise<{
  prompts: string[];
  answers: string[];
  round: number | null;
  upcoming: string[];
}> {
  const [questions, game] = await Promise.all([
    supabase
      .from("questions")
      .select("id, round, status, prompt")
      .eq("room_id", roomId),
    supabase
      .from("game_states")
      .select("round, phase, revealed_answer")
      .eq("room_id", roomId)
      .maybeSingle(),
  ]);
  const rows = (questions.data ?? []) as Array<{
    id: string;
    round: number;
    status: string;
    prompt: string | null;
  }>;
  const answered = rows.filter((row) => row.status === "answered");
  const answers: string[] = [];
  if (answered.length) {
    const { data } = await supabase
      .from("question_secrets")
      .select("answer")
      .in(
        "question_id",
        answered.map((row) => row.id),
      );
    for (const row of (data ?? []) as Array<{ answer: string | null }>)
      if (row.answer) answers.push(row.answer);
  }
  const revealed = (game.data as { revealed_answer?: string | null } | null)
    ?.revealed_answer;
  if (revealed) answers.push(revealed);
  const round = (game.data as { round?: number } | null)?.round ?? null;
  return {
    prompts: rows.flatMap((row) => (row.prompt ? [row.prompt] : [])),
    answers,
    round,
    upcoming: rows
      .filter(
        (row) => row.prompt && row.status !== "answered" && row.round === round,
      )
      .map((row) => row.prompt as string),
  };
}

/**
 * Быстрая проверка одной фразы для /api/tts: вердикт без ответа — без
 * запросов, вопрос — один запрос, ответ — только среди уже вскрытых.
 */
export async function isAllowedInRoom(
  supabase: SupabaseClient,
  roomId: string,
  text: string,
): Promise<boolean> {
  const clean = normalizeTtsText(text);
  if (!clean || clean.length > TTS_MAX_CHARS) return false;
  const verdict = parseVerdictPhrase(clean);
  if (verdict && verdict.answer === null) return true;
  if (!verdict) {
    const { data } = await supabase
      .from("questions")
      .select("prompt")
      .eq("room_id", roomId);
    const prompts = ((data ?? []) as Array<{ prompt: string | null }>)
      .map((row) => row.prompt)
      .filter((prompt): prompt is string => Boolean(prompt));
    return isAllowedPhrase(clean, { prompts, answers: [] });
  }
  const phrases = await roomPhrases(supabase, roomId);
  return isAllowedPhrase(clean, { prompts: [], answers: phrases.answers });
}
