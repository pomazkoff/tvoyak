import { describe, expect, it } from "vitest";
import { fallbackSrc, youtubeEmbedVars } from "@/lib/media/youtube";

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

describe("запасные плееры VK и Rutube", () => {
  it("Rutube: старт, стоп и автозапуск", () => {
    expect(
      fallbackSrc("https://rutube.ru/play/embed/abc", "rutube", 30, 38),
    ).toBe("https://rutube.ru/play/embed/abc?t=30&stopTime=38&autoplay=1");
  });

  it("VK: таймкод и автозапуск к уже имеющимся параметрам", () => {
    expect(
      fallbackSrc(
        "https://vk.com/video_ext.php?oid=-1&id=2&hash=h",
        "vk",
        5,
        12,
      ),
    ).toBe("https://vk.com/video_ext.php?oid=-1&id=2&hash=h&t=5s&autoplay=1");
  });
});
