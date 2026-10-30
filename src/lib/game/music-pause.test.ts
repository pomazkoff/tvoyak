import { describe, expect, it } from "vitest";
import {
  DEFAULT_MUSIC_VOLUME,
  MUSIC_TRACKS,
  parseMusicSettings,
  targetVolume,
} from "@/components/game/background-music";
import { mediaPlaysSound } from "@/lib/game/music-pause";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const none = {
  youtube_id: null,
  vk_url: null,
  rutube_url: null,
  audio_url: null,
};

describe("mediaPlaysSound", () => {
  it("pauses for video and music questions while they are on screen", () => {
    const video = { ...none, kind: "video" as const, youtube_id: "abc" };
    const preview = {
      ...none,
      kind: "music" as const,
      audio_url: "https://example.com/a.m4a",
    };
    const vk = { ...none, kind: "video" as const, vk_url: "https://vk.com/x" };
    for (const phase of [
      "question",
      "buzzing",
      "answering",
      "judging",
      "reveal",
    ]) {
      expect(mediaPlaysSound(video, phase)).toBe(true);
      expect(mediaPlaysSound(preview, phase)).toBe(true);
      expect(mediaPlaysSound(vk, phase)).toBe(true);
    }
  });

  it("keeps music on the board, in the lobby and for text/image questions", () => {
    const video = { ...none, kind: "video" as const, youtube_id: "abc" };
    for (const phase of ["lobby", "board", "cat_pick", "finished"]) {
      expect(mediaPlaysSound(video, phase)).toBe(false);
    }
    expect(mediaPlaysSound({ ...none, kind: "text" }, "question")).toBe(false);
    expect(
      mediaPlaysSound(
        { ...none, kind: "image", youtube_id: "abc" },
        "question",
      ),
    ).toBe(false);
    expect(mediaPlaysSound({ ...none, kind: "music" }, "question")).toBe(false);
  });
});

describe("background music settings", () => {
  it("defaults to on and quiet", () => {
    expect(parseMusicSettings(null)).toEqual({
      on: true,
      volume: DEFAULT_MUSIC_VOLUME,
    });
    expect(parseMusicSettings("not json").on).toBe(true);
    expect(DEFAULT_MUSIC_VOLUME).toBeGreaterThanOrEqual(0.15);
    expect(DEFAULT_MUSIC_VOLUME).toBeLessThanOrEqual(0.2);
  });

  it("restores saved choice and clamps volume", () => {
    expect(parseMusicSettings('{"on":false,"volume":0.3}')).toEqual({
      on: false,
      volume: 0.3,
    });
    expect(parseMusicSettings('{"volume":7}').volume).toBe(1);
    expect(parseMusicSettings('{"volume":-1}').volume).toBe(0);
  });

  it("fades to zero when off/suppressed and ducks under the host voice", () => {
    const base = {
      on: true,
      volume: 0.2,
      active: true,
      suppressed: false,
      speaking: false,
    };
    expect(targetVolume(base)).toBe(0.2);
    expect(targetVolume({ ...base, on: false })).toBe(0);
    expect(targetVolume({ ...base, suppressed: true })).toBe(0);
    expect(targetVolume({ ...base, active: false })).toBe(0);
    expect(targetVolume({ ...base, speaking: true })).toBeCloseTo(0.06);
  });

  it("ships every playlist track from /public/music with credits", () => {
    const root = path.resolve(process.cwd(), "public");
    let total = 0;
    for (const track of MUSIC_TRACKS) {
      const file = path.join(root, track);
      expect(existsSync(file)).toBe(true);
      total += statSync(file).size;
    }
    // Треки качаются по одному по мере проигрывания, не все сразу.
    expect(total).toBeLessThan(40 * 1024 * 1024);
    expect(existsSync(path.join(root, "music/CREDITS.md"))).toBe(true);
  });
});
