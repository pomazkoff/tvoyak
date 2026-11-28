import { describe, expect, it, vi } from "vitest";
import { GOAL_EVENT, metrikaCounterId, trackGoal } from "./goals";

function scopeWith(ym: unknown, ya?: unknown) {
  const events: CustomEvent[] = [];
  const target = {
    ym,
    Ya: ya,
    dispatchEvent(event: CustomEvent) {
      events.push(event);
      return true;
    },
  };
  return { target: target as unknown as Window, events };
}

describe("trackGoal", () => {
  it("зовёт ym, если счётчик уже в очереди", () => {
    const ym = Object.assign(vi.fn(), { a: [[4242, "init", {}]] });
    const { target, events } = scopeWith(ym);
    trackGoal("share_click", { format: "stories" }, target);
    expect(ym).toHaveBeenCalledWith(4242, "reachGoal", "share_click", {
      format: "stories",
    });
    expect(events[0]?.type).toBe(GOAL_EVENT);
    expect(events[0]?.detail).toEqual({
      goal: "share_click",
      format: "stories",
      sent: true,
    });
  });

  it("без ym только шлёт событие", () => {
    const { target, events } = scopeWith(undefined);
    trackGoal("final_qr_click", undefined, target);
    expect(events[0]?.detail).toEqual({ goal: "final_qr_click", sent: false });
  });

  it("берёт номер из getCounters и не роняет экран, если ym бросает", () => {
    const boom = Object.assign(
      vi.fn(() => {
        throw new Error("metrika");
      }),
      { a: [] as unknown[] },
    );
    const { target, events } = scopeWith(boom, {
      _metrika: { getCounters: () => [{ id: 7 }] },
    });
    expect(metrikaCounterId(target as never)).toBe(7);
    trackGoal("share_click", { format: "download" }, target);
    expect(events[0]?.detail).toMatchObject({
      goal: "share_click",
      format: "download",
      sent: false,
    });
  });

  it("на сервере ничего не делает", () => {
    expect(() => trackGoal("final_qr_click")).not.toThrow();
  });
});
