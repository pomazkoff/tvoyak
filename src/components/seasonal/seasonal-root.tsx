"use client";

import { Snow } from "@/components/seasonal/snow";
import { useSeasonalTheme } from "@/components/seasonal/use-seasonal-theme";

export function SeasonalRoot() {
  const theme = useSeasonalTheme();
  if (theme !== "newyear") return null;
  return <Snow />;
}
