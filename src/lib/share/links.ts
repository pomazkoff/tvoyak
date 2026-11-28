import { SITE_URL } from "@/lib/seo/site";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Игрок открывает вход сразу в эту комнату, код уже в адресе. */
export function playPath(code: string): string {
  return `/play/${code}`;
}

/**
 * «Проведи свой вечер».
 * ref — анонимный id комнаты на будущее, без начислений и без имени.
 */
export function hostEveningUrl(roomId: string | null | undefined): string {
  const url = new URL(SITE_URL);
  url.searchParams.set("utm_source", "product");
  url.searchParams.set("utm_medium", "final");
  url.searchParams.set("utm_campaign", "host_loop");
  if (roomId && UUID.test(roomId)) url.searchParams.set("ref", roomId);
  return url.toString();
}

export function resultPath(code: string): string {
  return `/itog/${code}`;
}

export function resultCardPath(
  code: string,
  format: "stories" | "square",
): string {
  return `/itog/${code}/card/${format}`;
}

export function resultFileName(format: "stories" | "square"): string {
  return format === "stories" ? "tvoyak-stories.png" : "tvoyak-square.png";
}

export function absoluteUrl(pathOrUrl: string, origin: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = origin.replace(/\/$/, "");
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${base}${path}`;
}

export function inviteMeta(code: string | null): {
  title: string;
  description: string;
} {
  if (!code) {
    return {
      title: "Вас зовут в Твояк",
      description:
        "Викторина для компании: табло на экране, ответы с телефонов. Первая партия бесплатно.",
    };
  }
  return {
    title: `Вас зовут в комнату ${code}`,
    description: `Комната ${code} уже открыта. Напишите имя и входите — первая партия бесплатно.`,
  };
}
