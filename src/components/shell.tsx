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
        className="mb-6 text-sm font-semibold tracking-[0.28em] text-gold uppercase"
      >
        Твояк
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
      className={`rounded-3xl border border-line bg-panel/90 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.28)] sm:p-6 ${className}`}
    >
      {children}
    </section>
  );
}
