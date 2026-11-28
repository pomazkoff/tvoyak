import type { MetadataRoute } from "next";
import { LEGAL_PATHS } from "@/lib/legal";
import { LANDING_PATHS } from "@/lib/seo/landings";
import { SITE_URL } from "@/lib/seo/site";

/** Только публичные страницы. Комнаты, админку и API сюда не включать. */
const PUBLIC_PATHS = [
  "/",
  "/business",
  ...LANDING_PATHS,
  ...LEGAL_PATHS,
] as const;

const LANDING_PATH_SET = new Set<string>(LANDING_PATHS);

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency:
      path === "/" || path === "/business" || LANDING_PATH_SET.has(path)
        ? "weekly"
        : "monthly",
    priority:
      path === "/"
        ? 1
        : LANDING_PATH_SET.has(path)
          ? 0.8
          : path === "/business"
            ? 0.7
            : path === "/tarify"
              ? 0.6
              : 0.3,
  }));
}
