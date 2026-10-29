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
      <Link href="/" className="mb-6 flex items-end gap-4">
        <span className="brush text-4xl sm:text-5xl">Твояк</span>
        <span className="kicker mb-1 text-[10px] text-muted">партия</span>
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
  return <section className={`sheet ${className}`}>{children}</section>;
}
