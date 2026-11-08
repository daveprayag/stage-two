import Link from "next/link";
import { Wordmark } from "./Logo";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ asOf }: { asOf: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="shrink-0">
          <Wordmark />
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-2">
          {asOf && <span className="num hidden rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-2 sm:inline">NSE close {asOf}</span>}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
