import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({
  children,
  width = "max-w-5xl",
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <div
      className={`mx-auto flex w-full flex-1 flex-col px-4 py-6 sm:px-8 sm:py-10 ${width}`}
    >
      <Link
        href="/"
        className="mb-6 flex items-baseline gap-3 text-xs tracking-[0.42em] text-muted uppercase"
      >
        <span className="text-gold">Твояк</span>
        <span className="h-px flex-1 bg-line" />
      </Link>
      {children}
    </div>
  );
}

export function Opening({ label }: { label: string }) {
  return (
    <Shell>
      <p className="py-16 text-center text-muted">{label}</p>
    </Shell>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`border border-line bg-panel p-5 sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
