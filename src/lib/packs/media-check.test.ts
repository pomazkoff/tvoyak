import { describe, expect, it } from "vitest";
import { reviewMedia } from "./media-check";
import type { DraftQuestion } from "./review";

const base: DraftQuestion = {
  category: "Клипы",
  prompt: "Чей это клип?",
  answer: "Адель",
  variants: [],
  value: 300,
  kind: "video",
  curtain: false,
  start_seconds: 0,
  end_seconds: 16,
};
const vk = "https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=ab";

describe("reviewMedia", () => {
  it("VK доступен — проходит", async () => {
    const r = await reviewMedia(
      { ...base, vk_url: vk },
      { check: async () => ({ status: "passed", notes: "ok" }) },
    );
    expect(r.status).toBe("passed");
    expect(r.draft.vk_url).toBe(vk);
  });
  it("VK недоступен, есть YouTube — VK снимаем", async () => {
    const r = await reviewMedia(
      { ...base, vk_url: vk, youtube_id: "abc" },
      { check: async () => ({ status: "failed", notes: "нет" }) },
    );
    expect(r.status).toBe("passed");
    expect(r.draft.vk_url).toBeNull();
  });
  it("VK недоступен и YouTube нет — отклоняем", async () => {
    const r = await reviewMedia(
      { ...base, vk_url: vk },
      { check: async () => ({ status: "failed", notes: "нет" }) },
    );
    expect(r.status).toBe("failed");
  });
  it("ищет VK по запросу", async () => {
    const r = await reviewMedia(
      { ...base, youtube_id: "abc", vk_query: "Adele Hello", vk_duration: 366 },
      {
        search: async () => [
          {
            oid: -1,
            id: 2,
            hash: "ab",
            title: "Adele - Hello",
            duration: 366,
            views: 10,
            embedUrl: vk,
            restricted: false,
          },
        ],
        check: async () => ({ status: "passed", notes: "ok" }),
      },
    );
    expect(r.draft.vk_url).toBe(vk);
    expect(r.status).toBe("passed");
  });
  it("без токена поиск пропускается, остаётся YouTube", async () => {
    const r = await reviewMedia(
      { ...base, youtube_id: "abc", vk_query: "x" },
      { search: async () => null },
    );
    expect(r.status).toBe("passed");
    expect(r.notes).toContain("без токена");
  });
});
