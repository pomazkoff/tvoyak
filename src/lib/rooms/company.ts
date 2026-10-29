/**
 * «Компания» для правила «без повторов»: один браузер ведущего = одна
 * компания. Id живёт в localStorage и уходит в POST /api/rooms; сервер
 * отмечает открытые вопросы и в следующих играх отдаёт сначала невиденные.
 */
export const COMPANY_KEY = "tvoyak.companyId";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isCompanyId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function companyId(
  storage: StorageLike | null | undefined,
  make: () => string = () => crypto.randomUUID(),
): string | null {
  try {
    const saved = storage?.getItem(COMPANY_KEY);
    if (isCompanyId(saved)) return saved;
    const fresh = make();
    if (!isCompanyId(fresh)) return null;
    storage?.setItem(COMPANY_KEY, fresh);
    return storage ? fresh : null;
  } catch {
    return null;
  }
}
