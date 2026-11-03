import type { NextConfig } from "next";

function publicEnv(serverName: string, publicName: string): string {
  return process.env[serverName] || process.env[publicName] || "";
}

// Адрес Supabase для браузера. NEXT_PUBLIC_SUPABASE_URL важнее SUPABASE_URL:
// браузер можно пустить через свой прокси (https://db.tvoyak.ru), а сервер
// продолжит ходить в Supabase напрямую по SUPABASE_URL.
function browserSupabaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    ""
  ).replace(/\/+$/, "");
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Комнаты, админка и API не должны попадать в поиск (дублирует meta robots).
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return ["/play/:path*", "/host/:path*", "/admin/:path*", "/api/:path*"].map(
      (source) => ({ source, headers: noindex }),
    );
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Браузеру нужны URL и anon-ключ для Realtime. Service role сюда не попадает.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: browserSupabaseUrl(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv(
      "SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ),
  },
};

export default nextConfig;
