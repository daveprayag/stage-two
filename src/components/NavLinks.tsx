"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, History, LayoutGrid, ListFilter, TrendingUp } from "lucide-react";

const LINKS = [
  { href: "/", label: "Screener", icon: ListFilter },
  { href: "/sectors", label: "Sectors", icon: LayoutGrid },
  { href: "/track", label: "Track", icon: TrendingUp },
  { href: "/guide", label: "Guide", icon: BookOpen },
  { href: "/runs", label: "Runs", icon: History },
];

function useActive() {
  const path = usePathname();
  return (href: string) => (href === "/" ? path === "/" || path.startsWith("/stock") : path.startsWith(href));
}

/** Desktop: inline links in the header. */
export function NavLinks() {
  const active = useActive();
  return (
    <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={active(l.href) ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-sm transition-colors ${active(l.href) ? "bg-surface-2 text-ink" : "text-ink-2 hover:text-ink"}`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Phones: a fixed tab bar at the bottom, within thumb reach. */
export function BottomNav() {
  const active = useActive();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {LINKS.map(({ href, label, icon: Icon }) => {
          const on = active(href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined} className={`flex flex-col items-center gap-1 py-2.5 text-[11px] ${on ? "text-ink" : "text-ink-3"}`}>
              <Icon className="h-5 w-5" strokeWidth={on ? 2.2 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
