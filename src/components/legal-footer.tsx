import Link from "next/link";
import { LEGAL_LINKS, SELLER } from "@/lib/legal";

/** Реквизиты и ссылки на документы. Не ставить на игровые экраны. */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`legal-footer${className ? ` ${className}` : ""}`}>
      <p>Услуги оказывает {SELLER.name}</p>
      <p>ИНН {SELLER.inn}</p>
      <p>{SELLER.address}</p>
      <p>
        <a href={`mailto:${SELLER.email}`}>{SELLER.email}</a>
      </p>
      <p className="legal-footer-links">
        {LEGAL_LINKS.map((link, index) => (
          <span key={link.href}>
            {index > 0 ? <span className="legal-footer-sep"> · </span> : null}
            <Link href={link.href}>{link.label}</Link>
          </span>
        ))}
      </p>
    </footer>
  );
}
