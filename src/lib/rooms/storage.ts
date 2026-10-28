"use client";

import { useSyncExternalStore } from "react";
import type { PlayerRole } from "@/lib/supabase/types";

export type StoredPlayer = {
  playerId: string;
  token: string;
  nickname: string;
  role: PlayerRole;
};

const listeners = new Set<() => void>();
const playerCache = new Map<
  string,
  { raw: string | null; player: StoredPlayer | null }
>();

function hostKey(code: string): string {
  return `tvoyak.hostSecret.${code}`;
}

function playerKey(code: string): string {
  return `tvoyak.player.${code}`;
}

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function saveHostSecret(code: string, secret: string): boolean {
  try {
    localStorage.setItem(hostKey(code), secret);
    emit();
    return true;
  } catch {
    return false;
  }
}

export function hasHostSecret(code: string): boolean {
  try {
    return Boolean(localStorage.getItem(hostKey(code)));
  } catch {
    return false;
  }
}

export function readPlayer(code: string): StoredPlayer | null {
  try {
    const raw = safeGet(playerKey(code));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredPlayer>;
    if (
      typeof parsed.playerId !== "string" ||
      typeof parsed.token !== "string" ||
      typeof parsed.nickname !== "string" ||
      (parsed.role !== "player" && parsed.role !== "spectator")
    ) {
      return null;
    }
    return {
      playerId: parsed.playerId,
      token: parsed.token,
      nickname: parsed.nickname,
      role: parsed.role,
    };
  } catch {
    return null;
  }
}

export function savePlayer(code: string, player: StoredPlayer): boolean {
  try {
    localStorage.setItem(playerKey(code), JSON.stringify(player));
    playerCache.delete(code);
    emit();
    return true;
  } catch {
    return false;
  }
}

export function clearPlayer(code: string): void {
  try {
    localStorage.removeItem(playerKey(code));
  } catch {
    // Сессия всё равно сбросится в памяти страницы.
  }
  playerCache.delete(code);
  emit();
}

function playerSnapshot(code: string): StoredPlayer | null {
  const raw = safeGet(playerKey(code));
  const cached = playerCache.get(code);
  if (cached && cached.raw === raw) return cached.player;
  const player = readPlayer(code);
  playerCache.set(code, { raw, player });
  return player;
}

export function useHasHostSecret(code: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (code ? hasHostSecret(code) : false),
    () => false,
  );
}

export function useStoredPlayer(code: string | null): StoredPlayer | null {
  return useSyncExternalStore(
    subscribe,
    () => (code ? playerSnapshot(code) : null),
    () => null,
  );
}
