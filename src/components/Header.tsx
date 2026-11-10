import Link from "next/link";
import { Suspense } from "react";
import { getLive, getScreen } from "@/lib/data";
import { HeaderDate } from "./HeaderDate";
import { Wordmark } from "./Logo";
import { NavLinks } from "./NavLinks";
import { ThemeToggle } from "./ThemeToggle";

/** The session date, loaded on its own so the page skeleton shows at once; nothing if the engine can't be reached. */
async function SessionDate() {
  const [screen, live] = await Promise.all([getScreen().catch(() => null), getLive()]);
  return screen?.asOf ? <HeaderDate asOf={screen.asOf} liveDate={live?.date ?? null} /> : null;
}

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="shrink-0" aria-label="Stage Two home">
          <Wordmark />
        </Link>
        <NavLinks />
        <div className="ml-auto flex items-center gap-3">
          <Suspense fallback={<span className="h-4 w-16 animate-pulse rounded bg-surface-2" aria-hidden="true" />}>
            <SessionDate />
          </Suspense>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
