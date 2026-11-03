import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  armAudioUnlock,
  resetAudioUnlockForTests,
  sharedAudioContext,
  unlockAudioContext,
} from "@/components/game/audio-unlock";

class FakeContext {
  static created = 0;
  state: "suspended" | "running" | "closed" | "interrupted" = "suspended";
  sampleRate = 44100;
  destination = {};
  started = 0;
  constructor() {
    FakeContext.created += 1;
  }
  createBuffer() {
    return {};
  }
  createBufferSource() {
    return {
      buffer: null as unknown,
      connect: () => undefined,
      start: () => {
        this.started += 1;
      },
    };
  }
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
}

type Listener = () => void;
let listeners: Record<string, Listener[]>;

beforeEach(() => {
  FakeContext.created = 0;
  listeners = {};
  resetAudioUnlockForTests();
  vi.stubGlobal("window", {
    AudioContext: FakeContext,
    addEventListener: (type: string, fn: Listener) => {
      (listeners[type] ??= []).push(fn);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("общий AudioContext для «Звука наоборот»", () => {
  it("один контекст на все вопросы", () => {
    const first = sharedAudioContext();
    const second = sharedAudioContext();
    expect(first).toBe(second);
    expect(FakeContext.created).toBe(1);
  });

  it("закрытый контекст пересоздаётся", () => {
    const first = sharedAudioContext() as unknown as FakeContext;
    first.state = "closed";
    expect(sharedAudioContext()).not.toBe(first);
    expect(FakeContext.created).toBe(2);
  });

  it("жест на странице будит контекст тихим сэмплом", async () => {
    armAudioUnlock();
    armAudioUnlock();
    expect(listeners.pointerdown).toHaveLength(1);
    expect(listeners.keydown).toHaveLength(1);
    listeners.pointerdown![0]!();
    await Promise.resolve();
    const context = sharedAudioContext() as unknown as FakeContext;
    expect(context.state).toBe("running");
    expect(context.started).toBe(1);
  });

  it("interrupted (iOS) тоже будится", async () => {
    const context = sharedAudioContext() as unknown as FakeContext;
    context.state = "interrupted";
    await expect(unlockAudioContext()).resolves.toBe(true);
  });

  it("без Web Audio — null и false, без исключений", async () => {
    vi.stubGlobal("window", { addEventListener: () => undefined });
    resetAudioUnlockForTests();
    expect(sharedAudioContext()).toBeNull();
    await expect(unlockAudioContext()).resolves.toBe(false);
  });
});
