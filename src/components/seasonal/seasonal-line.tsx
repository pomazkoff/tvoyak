import type { ReactNode } from "react";

/** Строка сезона. В потоке только при html[data-season=newyear]. */
export function SeasonalLine({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <p className={`seasonal-line hand ${className}`.trim()}>{children}</p>;
}
