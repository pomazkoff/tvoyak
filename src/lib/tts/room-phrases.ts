import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

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
