import type { ReactNode } from "react";

export function Shell({
  children,
  width = "max-w-3xl",
}: {
  children: ReactNode;
  width?: string;
}) {
  return (
    <div className={`mx-auto flex w-full flex-1 flex-col px-4 py-8 ${width}`}>
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
