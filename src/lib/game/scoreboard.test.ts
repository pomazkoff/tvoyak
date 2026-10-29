import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scoreboardPlayers } from "@/lib/game/scoreboard";

describe("scoreboardPlayers", () => {
  it("оставляет в табло только игроков", () => {
    const table = scoreboardPlayers([
      { role: "player", nickname: "Аня", score: 200 },
      { role: "spectator", nickname: "Зритель", score: 0 },
      { role: "player", nickname: "Боря", score: -100 },
    ]);
    expect(table.map((player) => player.nickname)).toEqual(["Аня", "Боря"]);
  });
});

describe("экраны табло", () => {
  it("считают очки через общий фильтр", () => {
    for (const file of [
      "src/components/game/board.tsx",
      "src/components/host-screen.tsx",
      "src/components/play-screen.tsx",
    ]) {
      expect(readFileSync(file, "utf8")).toContain("scoreboardPlayers");
    }
  });
});
