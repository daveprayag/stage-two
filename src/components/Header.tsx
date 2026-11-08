import Link from "next/link";
import { Wordmark } from "./Logo";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

export function Header({ asOf }: { asOf: string | null }) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="Stage Two home">
          <Wordmark />
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-3">
          {asOf && (
            <span className="text-xs text-ink-3">
              <span className="hidden sm:inline">NSE close </span>
              <span className="num text-ink-2">{asOf}</span>
            </span>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
