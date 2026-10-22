"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panel" },
  { href: "/hallazgos", label: "Hallazgos" },
  { href: "/cuentas", label: "Cuentas" },
  { href: "/conectar", label: "Conectar" },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="shell">
      <header className="masthead">
        <div>
          <p className="mark">Fanger</p>
          <p className="mark-sub">Auditor de Google Ads</p>
        </div>
        <nav aria-label="Secciones">
          {LINKS.map((link) => {
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <p className="stamp">Solo lectura</p>
      </header>
      <main>{children}</main>
    </div>
  );
}
