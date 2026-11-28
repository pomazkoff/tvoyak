import Link from "next/link";
import { LANDINGS, type LandingPage } from "@/lib/seo/landings";

/** Обычные текстовые ссылки на посадочные. Без кнопок, чтобы не спорить с шапкой. */
export function LandingLinks({
  except,
  lead = "Ещё",
  className = "",
}: {
  except?: LandingPage["path"];
  /** Подпись перед ссылками. Пустая строка — только ссылки, как в футере. */
  lead?: string;
  className?: string;
}) {
  const pages = LANDINGS.filter((page) => page.path !== except);
  return (
    <>
      {lead ? `${lead}: ` : null}
      {pages.map((page, index) => (
        <span key={page.path}>
          {index > 0 ? <span className="legal-footer-sep"> · </span> : null}
          <Link href={page.path} className={className || undefined}>
            {page.linkLabel}
          </Link>
        </span>
      ))}
    </>
  );
}
