import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("берёт первый адрес из X-Forwarded-For", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "")).toBe(
      "1.2.3.4",
    );
  });

  it("без заголовков — local", () => {
    expect(clientIp(h({}), undefined)).toBe("local");
  });

  it("верит X-Edge-Client-IP только с правильным секретом", () => {
    const headers = h({
      "x-forwarded-for": "9.9.9.9",
      "x-edge-client-ip": "1.2.3.4",
      "x-edge-secret": "s3cret",
    });
    expect(clientIp(headers, "s3cret")).toBe("1.2.3.4");
    expect(clientIp(headers, "other")).toBe("9.9.9.9");
    expect(clientIp(headers, undefined)).toBe("9.9.9.9");
  });
});
