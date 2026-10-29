import { describe, expect, it } from "vitest";
import {
  hashWithoutSecret,
  hostLink,
  hostPath,
  secretFromHash,
} from "@/lib/rooms/host-link";

const SECRET = "5ddc0603fc98d3c3368a8c484fc9bb367ddd3da2e0fd100e";

describe("ссылка ведущего", () => {
  it("кладёт ключ во фрагмент, а не в query", () => {
    expect(hostLink("https://a.vercel.app/", "RUSG", SECRET)).toBe(
      `https://a.vercel.app/host/RUSG#k=${SECRET}`,
    );
    expect(hostPath("RUSG", SECRET)).toBe(`/host/RUSG#k=${SECRET}`);
    expect(hostLink("https://a.vercel.app", "RUSG", SECRET)).not.toContain("?");
  });

  it("достаёт ключ из фрагмента и отбрасывает мусор", () => {
    expect(secretFromHash(`#k=${SECRET}`)).toBe(SECRET);
    expect(secretFromHash("")).toBeNull();
    expect(secretFromHash("#k=short")).toBeNull();
    expect(secretFromHash("#k=<script>alert(1)</script>xxxxxxxxxx")).toBeNull();
  });

  it("убирает ключ из адреса, не трогая остальное", () => {
    expect(hashWithoutSecret(`#k=${SECRET}`)).toBe("");
    expect(hashWithoutSecret(`#k=${SECRET}&x=1`)).toBe("#x=1");
  });
});
