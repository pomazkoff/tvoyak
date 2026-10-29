import { describe, expect, it } from "vitest";
import { isAllowedImageSource, isQuestionId } from "@/lib/media/image-proxy";

describe("прокси картинок", () => {
  it("принимает только uuid вопроса", () => {
    expect(isQuestionId("0b0f6a3e-8c1d-4a51-9f3e-2b7c8d9e0f11")).toBe(true);
    expect(isQuestionId("../etc/passwd")).toBe(false);
  });

  it("ходит только на https Викисклада", () => {
    expect(
      isAllowedImageSource(
        "https://commons.wikimedia.org/wiki/Special:FilePath/Colosseo%202020.jpg?width=960",
      ),
    ).toBe(true);
    expect(isAllowedImageSource("http://commons.wikimedia.org/x.jpg")).toBe(
      false,
    );
    expect(isAllowedImageSource("https://169.254.169.254/latest")).toBe(false);
    expect(isAllowedImageSource(null)).toBe(false);
  });
});
