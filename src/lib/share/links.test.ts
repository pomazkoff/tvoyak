import { describe, expect, it } from "vitest";
import { inviteCaption } from "./host-label";
import {
  absoluteUrl,
  hostEveningUrl,
  inviteMeta,
  playPath,
  resultCardPath,
  resultPath,
} from "./links";
import { resultMeta, type FinishedShare } from "./result";

const ROOM = "11111111-1111-4111-8111-111111111111";

describe("hostEveningUrl", () => {
  it("ведёт на главную с метками и анонимным ref", () => {
    expect(hostEveningUrl(ROOM)).toBe(
      `https://tvoyak.ru/?utm_source=product&utm_medium=final&utm_campaign=host_loop&ref=${ROOM}`,
    );
  });

  it("без id комнаты не добавляет ref и не кладёт имя", () => {
    const url = hostEveningUrl(null);
    expect(url).toBe(
      "https://tvoyak.ru/?utm_source=product&utm_medium=final&utm_campaign=host_loop",
    );
    const name = "Илья";
    expect(hostEveningUrl(ROOM).includes(name)).toBe(false);
    expect(url.includes(inviteCaption(name) ?? "приглашает")).toBe(false);
  });

  it("кривой ref не пропускает", () => {
    expect(hostEveningUrl("ABCD")).not.toContain("ref=");
  });
});

describe("пути шаринга", () => {
  it("вход в комнату и итог", () => {
    expect(playPath("ABCD")).toBe("/play/ABCD");
    expect(resultPath("ABCD")).toBe("/itog/ABCD");
    expect(resultCardPath("ABCD", "stories")).toBe("/itog/ABCD/card/stories");
    expect(absoluteUrl("/itog/ABCD", "https://tvoyak.ru/")).toBe(
      "https://tvoyak.ru/itog/ABCD",
    );
  });
});

describe("тексты превью", () => {
  it("приглашение называет код комнаты", () => {
    expect(inviteMeta("ABCD").title).toBe("Вас зовут в комнату ABCD");
    expect(inviteMeta(null).title).toBe("Вас зовут в Твояк");
  });

  it("итог говорит никами и счётом, без приглашения ведущего", () => {
    const finished: FinishedShare = {
      state: "finished",
      code: "ABCD",
      roomId: ROOM,
      mode: "versus",
      players: [
        { nickname: "Аня", score: 800 },
        { nickname: "Боря", score: 200 },
      ],
      team: null,
      nomination: { title: "Самый быстрый", nickname: "Аня" },
      seasonal: false,
    };
    const meta = resultMeta(finished);
    expect(meta.title).toBe("Победитель: Аня");
    expect(meta.description).toContain("Боря 200");
    expect(meta.description).not.toContain("приглашает");
    expect(
      resultMeta({ state: "playing", code: "ABCD", roomId: ROOM }).title,
    ).toBe("Итог вечера в Твояке");
  });

  it("вместе показывает общий счёт и серию", () => {
    const meta = resultMeta({
      state: "finished",
      code: "ABCD",
      roomId: ROOM,
      mode: "together",
      players: [{ nickname: "Аня", score: 400 }],
      team: { score: 1200, bestStreak: 4, correct: 8, played: 12 },
      nomination: null,
      seasonal: true,
    });
    expect(meta.title).toBe("Вместе набрали 1200");
    expect(meta.description).toContain("Лучшая серия 4");
  });
});
