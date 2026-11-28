import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveUtm } from "./persist";

function fakeClient(error: { code?: string; message?: string } | null) {
  const updates: { table: string; utm: unknown; id: string }[] = [];
  const client = {
    from(table: string) {
      return {
        update(payload: { utm: unknown }) {
          return {
            eq(_column: string, id: string) {
              updates.push({ table, utm: payload.utm, id });
              return Promise.resolve({ error });
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, updates };
}

describe("saveUtm", () => {
  it("пишет jsonb в указанную таблицу", async () => {
    const { client, updates } = fakeClient(null);
    const utm = { first: { source: "ya" }, last: { source: "tg" } };
    await saveUtm(client, "rooms", "room-1", utm);
    await saveUtm(client, "host_payments", "pay-1", utm);
    expect(updates).toEqual([
      { table: "rooms", id: "room-1", utm },
      { table: "host_payments", id: "pay-1", utm },
    ]);
  });

  it("пустое значение не трогает базу", async () => {
    const { client, updates } = fakeClient(null);
    await saveUtm(client, "rooms", "room-1", null);
    await saveUtm(client, "rooms", "", { last: { source: "ya" } });
    expect(updates).toEqual([]);
  });

  it("нет колонки — не ошибка", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const missing = fakeClient({
      code: "42703",
      message: 'column "utm" does not exist',
    });
    await saveUtm(missing.client, "rooms", "room-1", {
      last: { source: "ya" },
    });
    const cache = fakeClient({
      code: "PGRST204",
      message: "Could not find the 'utm' column of 'rooms' in the schema cache",
    });
    await saveUtm(cache.client, "host_payments", "pay-1", {
      last: { source: "ya" },
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("исключение клиента не пробрасывает", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      from() {
        throw new Error("schema");
      },
    } as unknown as SupabaseClient;
    await expect(
      saveUtm(client, "rooms", "room-1", { last: { source: "ya" } }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("utm_save", "rooms", "threw");
    spy.mockRestore();
  });

  it("прочую ошибку логирует и не бросает", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = fakeClient({ code: "23514", message: "check" });
    await expect(
      saveUtm(client, "rooms", "room-1", { last: { source: "ya" } }),
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledWith("utm_save", "rooms", "23514");
    spy.mockRestore();
  });
});
