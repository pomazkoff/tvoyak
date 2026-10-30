"use client";

/**
 * Фоновая музыка на главной и на экране ведущего (/host/КОД): чилл-хаус
 * вперемешку с энергичным хаусом — до создания комнаты, в лобби и во время
 * игры. Телефоны игроков (/play) молчат. Треки лежат у нас в /public/music
 * (CC BY 4.0, см. public/music/CREDITS.md) — никаких внешних CDN, всё с
 * нашего домена.
 *
 * Один <audio> на страницу. Громкость плавно уходит в ноль, когда:
 *  - музыку выключили кнопкой;
 *  - на экране вопрос с видео или треком (тогда пауза);
 * и приглушается, пока говорит голос ведущего (Марина / speechSynthesis).
 * Браузер может запретить автозапуск — тогда тихо ждём первого клика или
 * нажатия клавиши на странице и пробуем снова, без ошибок в консоль.
 */

import { useEffect, useSyncExternalStore } from "react";
import { isSpeaking, subscribeSpeaking } from "@/components/game/speech";

export const MUSIC_TRACKS = [
  "/music/uncan-new-friend.mp3",
  "/music/alex-morgan-tropical-house-paradise.mp3",
  "/music/uncan-aetheric.mp3",
  "/music/uncan-harx-hitter.mp3",
  // Энергичный хаус (CC BY 4.0, см. public/music/CREDITS.md).
  "/music/alex-morgan-neon-snap.mp3",
  "/music/1000-handz-clone.mp3",
  "/music/alex-morgan-house-music-classic.mp3",
  "/music/1000-handz-in-search-of-sunset.mp3",
  "/music/alex-morgan-dj-music.mp3",
  "/music/alex-morgan-hot-amapiano-beats.mp3",
  "/music/alex-morgan-exciting-music.mp3",
  "/music/alex-morgan-deep-house-sunset.mp3",
] as const;

export const DEFAULT_MUSIC_VOLUME = 0.18;
const STORAGE_KEY = "tvoyak:music";
/** Во сколько раз тише музыка под голосом ведущего. */
const DUCK_FACTOR = 0.3;
const FADE_MS = 900;

export type MusicSettings = { on: boolean; volume: number };
export type MusicSnapshot = MusicSettings & {
  /** Браузер не дал включить звук без клика. */
  blocked: boolean;
  playing: boolean;
};

const SERVER_SNAPSHOT: MusicSnapshot = {
  on: true,
  volume: DEFAULT_MUSIC_VOLUME,
  blocked: false,
  playing: false,
};

function clampVolume(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return DEFAULT_MUSIC_VOLUME;
  return Math.min(1, Math.max(0, number));
}

export function parseMusicSettings(raw: string | null): MusicSettings {
  if (!raw) return { on: true, volume: DEFAULT_MUSIC_VOLUME };
  try {
    const parsed = JSON.parse(raw) as Partial<MusicSettings>;
    return {
      on: parsed.on !== false,
      volume: clampVolume(parsed.volume ?? DEFAULT_MUSIC_VOLUME),
    };
  } catch {
    return { on: true, volume: DEFAULT_MUSIC_VOLUME };
  }
}

function readSettings(): MusicSettings {
  try {
    return parseMusicSettings(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return { on: true, volume: DEFAULT_MUSIC_VOLUME };
  }
}

function writeSettings(settings: MusicSettings) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Приватный режим без localStorage — просто не запоминаем.
  }
}

/** Целевая громкость с учётом кнопки, медиа-вопроса и голоса ведущего. */
export function targetVolume(input: {
  on: boolean;
  volume: number;
  active: boolean;
  suppressed: boolean;
  speaking: boolean;
}): number {
  if (!input.on || !input.active || input.suppressed) return 0;
  return input.volume * (input.speaking ? DUCK_FACTOR : 1);
}

function shuffled<T>(items: readonly T[]): T[] {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

let settings: MusicSettings | null = null;
let snapshot: MusicSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();

let audio: HTMLAudioElement | null = null;
let queue: string[] = [];
let active = false;
let suppressed = false;
let blocked = false;
let fadeFrame = 0;
let unlockArmed = false;
let stopSpeakingSub: (() => void) | null = null;

function currentSettings(): MusicSettings {
  if (!settings) settings = readSettings();
  return settings;
}

function publish() {
  const { on, volume } = currentSettings();
  const playing = Boolean(audio && !audio.paused);
  if (
    snapshot.on !== on ||
    snapshot.volume !== volume ||
    snapshot.blocked !== blocked ||
    snapshot.playing !== playing
  ) {
    snapshot = { on, volume, blocked, playing };
    for (const listener of listeners) listener();
  }
}

function nextTrack(): string {
  if (queue.length === 0) queue = shuffled(MUSIC_TRACKS);
  return queue.shift() ?? MUSIC_TRACKS[0];
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;
  const element = document.createElement("audio");
  element.id = "host-music";
  element.hidden = true;
  element.preload = "auto";
  element.volume = 0;
  element.dataset.role = "background-music";
  element.src = nextTrack();
  element.addEventListener("ended", () => {
    element.src = nextTrack();
    void tryPlay();
  });
  // Битый файл — просто следующий трек, без шума в интерфейсе.
  element.addEventListener("error", () => {
    if (!active) return;
    element.src = nextTrack();
    void tryPlay();
  });
  element.addEventListener("play", publish);
  element.addEventListener("pause", publish);
  document.body.appendChild(element);
  audio = element;
  return element;
}

function goal(): number {
  const { on, volume } = currentSettings();
  return targetVolume({
    on,
    volume,
    active,
    suppressed,
    speaking: isSpeaking(),
  });
}

function armUnlock() {
  if (unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchend", unlock, true);
    unlockArmed = false;
    if (goal() > 0) void tryPlay();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchend", unlock, true);
}

async function tryPlay(): Promise<void> {
  const element = ensureAudio();
  if (!element.paused) {
    fadeTo(goal());
    return;
  }
  try {
    await element.play();
    blocked = false;
    publish();
    fadeTo(goal());
  } catch {
    // NotAllowedError: ждём первого взаимодействия со страницей.
    blocked = true;
    publish();
    armUnlock();
  }
}

function fadeTo(target: number) {
  const element = audio;
  if (!element) return;
  window.cancelAnimationFrame(fadeFrame);
  const from = element.volume;
  const started = performance.now();
  const distance = Math.abs(target - from);
  const duration = Math.max(120, FADE_MS * Math.min(1, distance / 0.2));
  const step = (now: number) => {
    const progress = Math.min(1, (now - started) / duration);
    try {
      element.volume = from + (target - from) * progress;
    } catch {
      // iOS не даёт менять громкость — тогда только пауза/плей.
    }
    if (progress < 1) {
      fadeFrame = window.requestAnimationFrame(step);
      return;
    }
    if (target === 0 && !element.paused) element.pause();
  };
  fadeFrame = window.requestAnimationFrame(step);
}

function apply() {
  if (typeof window === "undefined") return;
  const target = goal();
  if (target > 0) void tryPlay();
  else if (audio) fadeTo(0);
  publish();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): MusicSnapshot {
  if (snapshot === SERVER_SNAPSHOT) {
    const { on, volume } = currentSettings();
    snapshot = { on, volume, blocked, playing: false };
  }
  return snapshot;
}

export function setMusicOn(on: boolean) {
  settings = { ...currentSettings(), on };
  writeSettings(settings);
  apply();
}

export function setMusicVolume(volume: number) {
  settings = { ...currentSettings(), volume: clampVolume(volume) };
  writeSettings(settings);
  if (audio && !audio.paused) fadeTo(goal());
  else apply();
  publish();
}

export function useMusicState(): MusicSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_SNAPSHOT);
}

/** Пауза между страницами: успевает смонтироваться следующий экран. */
const HANDOFF_MS = 1500;
let users = 0;
let releaseTimer = 0;

/**
 * Включает фон на время жизни компонента (главная и экран ведущего).
 * `suppressed` — на экране вопрос с видео или треком: музыка плавно уходит
 * на паузу и возвращается потом. Плеер один на вкладку и переживает
 * клиентский переход «главная → /host», поэтому музыка не обрывается.
 * На страницах без этого хука (телефоны игроков) музыка гаснет.
 */
export function useBackgroundMusic({
  suppressed: hold,
}: {
  suppressed: boolean;
}) {
  useEffect(() => {
    users += 1;
    window.clearTimeout(releaseTimer);
    active = true;
    if (!stopSpeakingSub) {
      stopSpeakingSub = subscribeSpeaking(() => {
        if (audio && !audio.paused) fadeTo(goal());
      });
    }
    apply();
    return () => {
      users -= 1;
      window.clearTimeout(releaseTimer);
      releaseTimer = window.setTimeout(() => {
        if (users > 0) return;
        active = false;
        suppressed = false;
        stopSpeakingSub?.();
        stopSpeakingSub = null;
        apply();
      }, HANDOFF_MS);
    };
  }, []);

  useEffect(() => {
    suppressed = hold;
    apply();
    return () => {
      if (hold) {
        suppressed = false;
      }
    };
  }, [hold]);
}
