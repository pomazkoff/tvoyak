import { describe, expect, it } from "vitest";
import { pickVkCandidate, readEmbedPage, toCandidate } from "./vk-search";

describe("vk-search", () => {
  it("кандидат только с hash из player", () => {
    expect(
      toCandidate({
        owner_id: -1,
        id: 2,
        player: "https://vk.com/video_ext.php?oid=-1&id=2",
      }),
    ).toBeNull();
    const item = toCandidate({
      owner_id: -1,
      id: 2,
      duration: 213,
      views: 5,
      title: "x",
      player: "https://vk.com/video_ext.php?oid=-1&id=2&hash=ab12",
    });
    expect(item?.embedUrl).toBe(
      "https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=ab12",
    );
    expect(item?.restricted).toBe(false);
  });
  it("выбирает по длительности, потом по просмотрам", () => {
    const base = {
      oid: -1,
      hash: "a",
      title: "",
      embedUrl: "",
      restricted: false,
    };
    const items = [
      { ...base, id: 1, duration: 100, views: 1000 },
      { ...base, id: 2, duration: 213, views: 10 },
      { ...base, id: 3, duration: 212, views: 50 },
      { ...base, id: 4, duration: 213, views: 9999, restricted: true },
    ];
    expect(pickVkCandidate(items, 213)?.id).toBe(3);
    expect(pickVkCandidate(items)?.id).toBe(1);
  });
  it("читает страницу плеера", () => {
    expect(readEmbedPage('{"duration":412,"hls":"x"}')).toMatchObject({
      status: "passed",
      duration: 412,
    });
    expect(readEmbedPage("<div>Видео недоступно</div>").status).toBe("failed");
    expect(readEmbedPage("<html>robot challenge</html>").status).toBe(
      "skipped",
    );
  });
});
