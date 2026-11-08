"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Screener" },
  { href: "/sectors", label: "Sectors" },
  { href: "/guide", label: "Guide" },
  { href: "/runs", label: "Runs" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <nav className="flex min-w-0 items-center gap-0.5 overflow-x-auto text-sm">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" || path.startsWith("/stock") : path.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`rounded-md px-2.5 py-1.5 whitespace-nowrap ${active ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
