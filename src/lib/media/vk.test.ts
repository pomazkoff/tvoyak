import { describe, expect, it } from "vitest";
import { parseVkVideo, vkEmbedUrl, vkPlayerSrc, vkSegment } from "./vk";

describe("parseVkVideo", () => {
  it("читает video_ext.php с hash", () => {
    expect(
      parseVkVideo(
        "https://vk.com/video_ext.php?oid=-22277933&id=456242634&hash=fdec3f370e33f3f8&hd=2",
      ),
    ).toEqual({ oid: -22277933, id: 456242634, hash: "fdec3f370e33f3f8" });
  });
  it("читает обычную ссылку и короткую форму", () => {
    expect(parseVkVideo("https://vkvideo.ru/video-1_2")).toEqual({
      oid: -1,
      id: 2,
      hash: null,
    });
    expect(parseVkVideo("https://vk.com/video?z=video123_45%2Fpl")).toEqual({
      oid: 123,
      id: 45,
      hash: null,
    });
    expect(parseVkVideo("-5_6")).toEqual({ oid: -5, id: 6, hash: null });
  });
  it("отказывает мусору", () => {
    expect(parseVkVideo("")).toBeNull();
    expect(parseVkVideo("https://youtube.com/watch?v=x")).toBeNull();
    expect(parseVkVideo("https://vk.com/video_ext.php?oid=1")).toBeNull();
  });
});

describe("vkPlayerSrc", () => {
  it("каноническая ссылка, JS API и старт", () => {
    const url = vkEmbedUrl({ oid: -1, id: 2, hash: "ab" });
    expect(url).toBe("https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=ab");
    expect(vkPlayerSrc(url + "&t=99s&autoplay=0", 30.7)).toBe(
      "https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=ab&hd=2&js_api=1&autoplay=1&t=30s",
    );
    expect(vkPlayerSrc(url, 0, false)).toBe(
      "https://vkvideo.ru/video_ext.php?oid=-1&id=2&hash=ab&hd=2&js_api=1",
    );
    expect(vkPlayerSrc("nope", 0)).toBeNull();
  });
});

describe("vkSegment", () => {
  it("свои таймкоды важнее общих", () => {
    expect(
      vkSegment({
        vk_start_seconds: 5,
        vk_end_seconds: 20,
        start_seconds: 0,
        end_seconds: 16,
      }),
    ).toEqual({ start: 5, end: 20 });
    expect(vkSegment({ start_seconds: 10, end_seconds: 26 })).toEqual({
      start: 10,
      end: 26,
    });
    expect(
      vkSegment({ vk_start_seconds: 7, start_seconds: 0, end_seconds: 16 }),
    ).toEqual({ start: 7, end: null });
    expect(vkSegment({ start_seconds: 30, end_seconds: 10 })).toEqual({
      start: 30,
      end: null,
    });
  });
});
