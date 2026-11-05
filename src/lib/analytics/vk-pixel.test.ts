import { describe, expect, it } from "vitest";
import { pickUtm } from "./vk-pixel";

describe("pickUtm", () => {
  it("берёт только utm-метки и rb_clickid", () => {
    expect(
      pickUtm("?utm_source=vk&utm_campaign=b2c&x=1&rb_clickid=abc"),
    ).toEqual({ utm_source: "vk", utm_campaign: "b2c", rb_clickid: "abc" });
  });
  it("без меток — null", () => {
    expect(pickUtm("?code=ZEMT")).toBeNull();
  });
});
