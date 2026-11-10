import type { MetadataRoute } from "next";
import { LEGAL_PATHS } from "@/lib/legal";
import { SITE_URL } from "@/lib/seo/site";

/** Только публичные страницы. Комнаты, админку и API сюда не включать. */
const PUBLIC_PATHS = ["/", "/business", ...LEGAL_PATHS] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency:
      path === "/" || path === "/business" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : path === "/business" ? 0.7 : 0.3,
  }));
}
