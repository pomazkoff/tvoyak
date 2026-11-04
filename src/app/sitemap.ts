import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/** Только публичные страницы. Комнаты, админку и API сюда не включать. */
const PUBLIC_PATHS = ["/", "/business"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.7,
  }));
}
