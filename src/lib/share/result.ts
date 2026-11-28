export type SharePlayer = { nickname: string; score: number };

export type ShareNomination = { title: string; nickname: string };

export type TeamShare = {
  score: number;
  bestStreak: number;
  correct: number;
  played: number;
};

export type FinishedShare = {
  state: "finished";
  code: string;
  roomId: string;
  mode: "versus" | "together";
  players: SharePlayer[];
  team: TeamShare | null;
  nomination: ShareNomination | null;
  seasonal: boolean;
};

export type ShareResult =
  | { state: "missing" }
  | { state: "playing"; code: string; roomId: string }
  | FinishedShare;

export function seatTable(players: readonly SharePlayer[]): SharePlayer[] {
  return [...players].sort(
    (left, right) =>
      right.score - left.score ||
      left.nickname.localeCompare(right.nickname, "ru"),
  );
}

export function leadersOf(players: readonly SharePlayer[]): SharePlayer[] {
  const table = seatTable(players);
  const best = table[0];
  if (!best) return [];
  return table.filter((player) => player.score === best.score);
}

/** Текст превью итога: ники и счёт, без имени ведущего и без ответов. */
export function resultMeta(result: ShareResult): {
  title: string;
  description: string;
} {
  if (result.state !== "finished") {
    return {
      title: "Итог вечера в Твояке",
      description:
        "Викторина для компании. Табло на экране, ответы с телефонов. Первая партия бесплатно.",
    };
  }
  if (result.mode === "together") {
    const score = result.team?.score ?? 0;
    const best = result.team?.bestStreak ?? 0;
    const streak =
      best > 0 ? `Лучшая серия ${best}.` : "Серия в этот раз не собралась.";
    return {
      title: `Вместе набрали ${score}`,
      description: `Общий счёт ${score}. ${streak}`,
    };
  }
  const leaders = leadersOf(result.players);
  const table = seatTable(result.players)
    .slice(0, 4)
    .map((player) => `${player.nickname} ${player.score}`)
    .join(", ");
  if (leaders.length === 1 && leaders[0]) {
    return {
      title: `Победитель: ${leaders[0].nickname}`,
      description: table || "Итог вечера в Твояке.",
    };
  }
  if (leaders.length > 1) {
    return {
      title: `Ничья: ${leaders.map((player) => player.nickname).join(" и ")}`,
      description: table || "Итог вечера в Твояке.",
    };
  }
  return {
    title: "Итог вечера в Твояке",
    description: "Партия сыграна.",
  };
}
