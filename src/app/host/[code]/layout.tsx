import type { Metadata } from "next";

/**
 * Комнаты временные и отдают 200 на любой код: в индекс не пускаем.
 * Статические метаданные попадают в <head> без ожидания params.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function HostRoomLayout({
  children,
}: LayoutProps<"/host/[code]">) {
  return children;
}
