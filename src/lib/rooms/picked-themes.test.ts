import { describe, expect, it } from "vitest";
import {
  clearPickedThemes,
  readPickedThemes,
  savePickedThemes,
} from "@/lib/rooms/picked-themes";

function memory(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => {
      data.delete(key);
    },
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

describe("темы, закреплённые в браузере", () => {
  it("отдаёт набор только для той же комнаты", () => {
    const storage = memory();
    const themes = Array.from({ length: 12 }, (_, index) => `Тема ${index}`);
    savePickedThemes(storage, "ABCD", themes);
    expect(readPickedThemes(storage, "ABCD")).toEqual(themes);
    expect(readPickedThemes(storage, "WXYZ")).toBeNull();
    clearPickedThemes(storage);
    expect(readPickedThemes(storage, "ABCD")).toBeNull();
  });

  it("битое хранилище не роняет чтение", () => {
    const storage = memory();
    storage.setItem("tvoyak.pickedThemes", "{");
    expect(readPickedThemes(storage, "ABCD")).toBeNull();
    expect(readPickedThemes(null, "ABCD")).toBeNull();
  });
});
