export function normalizeRoomCode(code: string): string | null {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(normalized)) return null;
  return normalized;
}
