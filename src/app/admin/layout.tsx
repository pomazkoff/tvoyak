import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Админка",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
