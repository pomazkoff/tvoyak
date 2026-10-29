import type { NextConfig } from "next";

function publicEnv(serverName: string, publicName: string): string {
  return process.env[serverName] || process.env[publicName] || "";
}

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
    NEXT_PUBLIC_SUPABASE_URL: publicEnv(
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_URL",
    ),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: publicEnv(
      "SUPABASE_ANON_KEY",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ),
  },
};

export default nextConfig;
