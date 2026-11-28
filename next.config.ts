import type { NextConfig } from "next";

function publicEnv(serverName: string, publicName: string): string {
  return process.env[serverName] || process.env[publicName] || "";
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  // Комнаты, админка и API не должны попадать в поиск (дублирует meta robots).
  async headers() {
    const noindex = [{ key: "X-Robots-Tag", value: "noindex, nofollow" }];
    return [
      "/play/:path*",
      "/host/:path*",
      "/itog/:path*",
      "/admin/:path*",
      "/api/:path*",
    ].map((source) => ({ source, headers: noindex }));
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
  // VERCEL_ENV сам в клиент не вшивается. Он нужен Метрике, чтобы дефолтный
  // счётчик включался только в продакшен-сборке, не на превью и не локально.
  env: {
    NEXT_PUBLIC_SUPABASE_URL: publicEnv(
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv(
      "SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ),
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV || "",
  },
};

export default nextConfig;
