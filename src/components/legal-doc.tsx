import Link from "next/link";
import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal-footer";
import { Logo } from "@/components/marks";

export function LegalDoc({
  title,
  edition,
  children,
}: {
  title: string;
  edition: string;
  children: ReactNode;
}) {
  return (
    <main className="legal-page">
      <article className="legal">
        <Link href="/" aria-label="Твояк — на главную" className="legal-logo">
          <Logo compact />
        </Link>
        <h1>{title}</h1>
        <p className="legal-edition">{edition}</p>
        {children}
      </article>
      <LegalFooter />
    </main>
  );
}
