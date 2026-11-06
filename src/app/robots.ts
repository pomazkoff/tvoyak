import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo/site";

/**
 * /play/ и /host/ здесь НЕ закрыты: иначе робот не увидит их noindex.
 * Комнаты закрыты метатегом robots и заголовком X-Robots-Tag.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
