/** В табло только сидящие игроки. Зритель видит счёт, но своей строки не имеет. */
export function scoreboardPlayers<T extends { role?: string | null }>(
  players: readonly T[],
): T[] {
  return players.filter((player) => player.role === "player");
}
