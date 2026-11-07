import { describe, expect, it } from "vitest";
import { secretFromHash } from "@/lib/rooms/host-link";
import {
  TV_CODE_LENGTH,
  formatCodeTtl,
  formatTvCode,
  normalizeTvCode,
  randomTvCode,
  tvEntryLabel,
} from "@/lib/rooms/tv-code";

describe("код для телевизора", () => {
  it("принимает шесть цифр с пробелом и дефисом", () => {
    expect(normalizeTvCode("123456")).toBe("123456");
    expect(normalizeTvCode("123 456")).toBe("123456");
    expect(normalizeTvCode("123-456")).toBe("123456");
    expect(normalizeTvCode("  000042 ")).toBe("000042");
    expect(formatTvCode("123456")).toBe("123 456");
  });

  it("отбрасывает короткие, длинные и нецифровые коды", () => {
    expect(normalizeTvCode("12345")).toBeNull();
    expect(normalizeTvCode("1234567")).toBeNull();
    expect(normalizeTvCode("12345a")).toBeNull();
    expect(normalizeTvCode("ABCDEF")).toBeNull();
    expect(normalizeTvCode("")).toBeNull();
    expect(normalizeTvCode(null)).toBeNull();
  });

  it("показывает адрес /tv: прод без www, превью — своим хостом", () => {
    expect(tvEntryLabel("https://tvoyak.ru")).toBe("tvoyak.ru/tv");
    expect(tvEntryLabel("https://www.tvoyak.ru/")).toBe("tvoyak.ru/tv");
    expect(tvEntryLabel("https://tvoyak-git-foo.vercel.app")).toBe(
      "tvoyak-git-foo.vercel.app/tv",
    );
    expect(tvEntryLabel("http://localhost:3000")).toBe("localhost:3000/tv");
    expect(tvEntryLabel("")).toBe("tvoyak.ru/tv");
  });

  it("склоняет оставшиеся минуты и молчит, когда срок вышел", () => {
    const now = Date.parse("2026-11-07T12:00:00Z");
    expect(formatCodeTtl("2026-11-07T12:15:00Z", now)).toBe("ещё 15 минут");
    expect(formatCodeTtl("2026-11-07T12:01:00Z", now)).toBe("ещё 1 минуту");
    expect(formatCodeTtl("2026-11-07T12:02:30Z", now)).toBe("ещё 3 минуты");
    expect(formatCodeTtl("2026-11-07T11:00:00Z", now)).toBeNull();
    expect(formatCodeTtl("не дата", now)).toBeNull();
  });

  it("генерирует шесть цифр и отбрасывает байты вне диапазона", () => {
    const queue = [
      new Uint8Array([0xff, 0xff, 0xff, 0xff]),
      new Uint8Array([0x00, 0x00, 0x00, 42]),
    ];
    const code = randomTvCode(() => queue.shift() ?? new Uint8Array(4));
    expect(code).toBe("000042");
    expect(code).toHaveLength(TV_CODE_LENGTH);

    let seed = 3;
    const bytes = (size: number) =>
      Uint8Array.from({ length: size }, () => (seed = (seed * 97 + 13) % 256));
    for (let i = 0; i < 40; i += 1) {
      expect(normalizeTvCode(randomTvCode(bytes))).not.toBeNull();
    }
  });

  it("ключ экрана проходит в адрес табло так же, как ключ комнаты", () => {
    const token = `${"a".repeat(40)}-_Z`;
    expect(secretFromHash(`#k=${token}`)).toBe(token);
  });
});
