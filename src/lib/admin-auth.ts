import "server-only";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "tvoyak_admin";

/** Токены, которые пускают в админку. ADMIN_REVIEW_TOKEN — только ревью картинок. */
export function adminScope(
  token: string | undefined | null,
): "admin" | "review" | null {
  if (!token) return null;
  if (process.env.ADMIN_TOKEN && token === process.env.ADMIN_TOKEN)
    return "admin";
  if (
    process.env.ADMIN_REVIEW_TOKEN &&
    token === process.env.ADMIN_REVIEW_TOKEN
  ) {
    return "review";
  }
  return null;
}

/** Можно ли смотреть и менять ревью картиночных заданий. */
export async function canReviewPictures(): Promise<boolean> {
  const jar = await cookies();
  return adminScope(jar.get(ADMIN_COOKIE)?.value) !== null;
}
