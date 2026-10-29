import { describe, expect, it } from "vitest";
import { youtubeEmbedVars } from "@/lib/media/youtube";

describe("встраивание YouTube", () => {
  it("прячет всё, что выдаёт ответ", () => {
    const vars = youtubeEmbedVars({ start: 12, end: 40, autoplay: true });
    expect(vars).toMatchObject({
      controls: 0,
      rel: 0,
      modestbranding: 1,
      iv_load_policy: 3,
      disablekb: 1,
      playsinline: 1,
      autoplay: 1,
      start: 12,
      end: 40,
    });
  });

  it("не ставит конец раньше начала", () => {
    const vars = youtubeEmbedVars({ start: 30, end: 10, autoplay: false });
    expect(vars.end).toBeUndefined();
    expect(vars.autoplay).toBe(0);
  });
});
