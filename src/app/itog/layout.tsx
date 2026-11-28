import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Итоги временные: в индекс не пускаем, превью для чатов оставляем. */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function ItogLayout({ children }: { children: ReactNode }) {
  return children;
}
