import { describe, expect, it } from "vitest";
import { COMPANY_KEY, companyId, isCompanyId } from "@/lib/rooms/company";

function memory(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

const ID = "3f2b8c1e-4a5d-4e6f-9a7b-1c2d3e4f5a6b";

describe("company id", () => {
  it("validates uuids", () => {
    expect(isCompanyId(ID)).toBe(true);
    expect(isCompanyId("x")).toBe(false);
    expect(isCompanyId(null)).toBe(false);
    expect(isCompanyId(`${ID}'; drop`)).toBe(false);
  });

  it("creates once and then reuses", () => {
    const storage = memory();
    expect(companyId(storage, () => ID)).toBe(ID);
    expect(storage.getItem(COMPANY_KEY)).toBe(ID);
    expect(companyId(storage, () => "other")).toBe(ID);
  });

  it("replaces garbage and survives a broken storage", () => {
    const storage = memory();
    storage.setItem(COMPANY_KEY, "garbage");
    expect(companyId(storage, () => ID)).toBe(ID);
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
    };
    expect(companyId(broken, () => ID)).toBeNull();
    expect(companyId(null, () => ID)).toBeNull();
  });
});
