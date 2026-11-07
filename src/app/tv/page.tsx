import type { Metadata } from "next";
import { TvScreen } from "@/components/tv-screen";

export const metadata: Metadata = {
  title: "Телевизор",
  robots: { index: false, follow: false },
  description:
    "Введите шестизначный код с телефона ведущего — табло откроется без входа.",
};

export default function TvPage() {
  return <TvScreen />;
}
