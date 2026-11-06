import { describe, expect, it } from "vitest";
import {
  PAIR_ALPHABET,
  PAIR_LENGTH,
  formatPairCode,
  isPhoneToken,
  normalizePairCode,
  pairFromHash,
  phoneLink,
  randomPairCode,
} from "@/lib/rooms/host-phone";

describe("код привязки телефона ведущего", () => {
  it("принимает код с дефисом и в любом регистре", () => {
    expect(normalizePairCode("abcd-efgh")).toBe("ABCDEFGH");
    expect(normalizePairCode(" ABCD EFGH ")).toBe("ABCDEFGH");
    expect(formatPairCode("ABCDEFGH")).toBe("ABCD-EFGH");
  });

  it("отбрасывает похожие символы, короткие и длинные коды", () => {
    expect(normalizePairCode("ABCD-EFG0")).toBeNull();
    expect(normalizePairCode("ABCDEFGI")).toBeNull();
    expect(normalizePairCode("ABC")).toBeNull();
    expect(normalizePairCode("ABCDEFGHJ")).toBeNull();
    expect(normalizePairCode(null)).toBeNull();
  });

  it("кладёт код во фрагмент ссылки, а не в query", () => {
    const link = phoneLink("https://a.vercel.app/", "RUSG", "ABCDEFGH");
    expect(link).toBe("https://a.vercel.app/host/RUSG/phone#p=ABCDEFGH");
    expect(link).not.toContain("?");
    expect(pairFromHash("#p=abcdefgh")).toBe("ABCDEFGH");
    expect(pairFromHash("#k=ABCDEFGH")).toBeNull();
  });

  it("генерирует коды только из алфавита", () => {
    let seed = 7;
    const bytes = (size: number) =>
      Uint8Array.from({ length: size }, () => (seed = (seed * 97 + 13) % 256));
    for (let i = 0; i < 50; i += 1) {
      const code = randomPairCode(bytes);
      expect(code).toHaveLength(PAIR_LENGTH);
      expect([...code].every((char) => PAIR_ALPHABET.includes(char))).toBe(
        true,
      );
      expect(normalizePairCode(code)).toBe(code);
    }
  });

  it("ключ телефона — только base64url нужной длины", () => {
    expect(isPhoneToken("a".repeat(43))).toBe(true);
    expect(isPhoneToken("short")).toBe(false);
    expect(isPhoneToken(`${"a".repeat(40)}<>`)).toBe(false);
    expect(isPhoneToken(42)).toBe(false);
  });
});
