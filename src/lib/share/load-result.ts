import "server-only";
import { resolveSeasonalTheme } from "@/lib/seasonal/new-year";
import { isTogether } from "@/lib/game/together";
import { normalizeRoomCode } from "@/lib/rooms/codes";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { scoreboardPlayers } from "@/lib/game/scoreboard";
import {
  pickNomination,
  timedFromRows,
  type AnswerRow,
  type BuzzRow,
} from "./nominations";
import { seatTable, type ShareResult, type TeamShare } from "./result";

type RoomBits = {
  id: string;
  code: string;
  status: string;
  play_mode?: string | null;
  team_score?: number | null;
  team_best_streak?: number | null;
  team_correct?: number | null;
  team_played?: number | null;
};

const RICH =
  "id, code, status, play_mode, team_score, team_best_streak, team_correct, team_played";
const PLAIN = "id, code, status";

/**
 * Публичный итог: ники и очки. Тексты ответов не читаем.
 * Имени ведущего здесь нет — оно только на экранах этой комнаты.
 */
export async function loadShareResult(raw: string): Promise<ShareResult> {
  try {
    return await readShareResult(raw);
  } catch {
    console.error("share_result");
    return { state: "missing" };
  }
}

async function readShareResult(raw: string): Promise<ShareResult> {
  const code = normalizeRoomCode(raw);
  if (!code) return { state: "missing" };
  const supabase = getServiceSupabase();
  const rich = await supabase
    .from("rooms")
    .select(RICH)
    .eq("code", code)
    .maybeSingle();
  let room = rich.error ? null : (rich.data as RoomBits | null);
  if (rich.error) {
    const plain = await supabase
      .from("rooms")
      .select(PLAIN)
      .eq("code", code)
      .maybeSingle();
    if (plain.error || !plain.data) return { state: "missing" };
    room = plain.data as RoomBits;
  }
  if (!room) return { state: "missing" };
  if (room.status !== "finished") {
    return { state: "playing", code: room.code, roomId: room.id };
  }

  const people = await supabase
    .from("players")
    .select("id, nickname, role, score")
    .eq("room_id", room.id);
  if (people.error) return { state: "missing" };
  const seated = scoreboardPlayers(
    (people.data ?? []) as {
      id: string;
      nickname: string;
      role: string;
      score: number;
    }[],
  );
  const players = seatTable(
    seated.map((player) => ({
      nickname: player.nickname,
      score: player.score,
    })),
  );
  const seats = seated.map((player) => ({
    id: player.id,
    nickname: player.nickname,
  }));

  const [answers, questions, buzzes] = await Promise.all([
    supabase
      .from("answers")
      .select("player_id, question_id, verdict, created_at")
      .eq("room_id", room.id),
    supabase.from("questions").select("id, opened_at").eq("room_id", room.id),
    supabase
      .from("buzzes")
      .select("player_id, question_id, is_first, server_time")
      .eq("room_id", room.id),
  ]);

  let nomination = null;
  if (!answers.error) {
    const openedAt = new Map<string, string | null>();
    if (!questions.error) {
      for (const question of questions.data ?? []) {
        const row = question as { id: string; opened_at: string | null };
        openedAt.set(row.id, row.opened_at);
      }
    }
    const answerRows: AnswerRow[] = (answers.data ?? []).map((row) => {
      const item = row as {
        player_id: string;
        question_id: string;
        verdict: string;
        created_at: string;
      };
      return {
        playerId: item.player_id,
        questionId: item.question_id,
        verdict: item.verdict,
        createdAt: item.created_at,
      };
    });
    const buzzRows: BuzzRow[] = buzzes.error
      ? []
      : (buzzes.data ?? []).map((row) => {
          const item = row as {
            player_id: string;
            question_id: string;
            is_first: boolean;
            server_time: string;
          };
          return {
            playerId: item.player_id,
            questionId: item.question_id,
            first: item.is_first,
            at: item.server_time,
          };
        });
    nomination = pickNomination(
      seats,
      timedFromRows(answerRows, openedAt, buzzRows),
    );
  }

  const together = isTogether(room.play_mode);
  const team: TeamShare | null = together
    ? {
        score: room.team_score ?? 0,
        bestStreak: room.team_best_streak ?? 0,
        correct: room.team_correct ?? 0,
        played: room.team_played ?? 0,
      }
    : null;

  return {
    state: "finished",
    code: room.code,
    roomId: room.id,
    mode: together ? "together" : "versus",
    players,
    team,
    nomination,
    seasonal:
      resolveSeasonalTheme({
        now: new Date(),
        env: process.env.NEXT_PUBLIC_SEASONAL_THEME,
      }) != null,
  };
}
