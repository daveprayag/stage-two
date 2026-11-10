"use client";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Page } from "@/components/Page";

/** Shown when the latest data can't be loaded. Deliberately no fallback to an older copy. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });
  return (
    <Page narrow>
      <div role="alert" className="flex flex-col items-start gap-3 py-16">
        <h1 className="font-display text-4xl leading-tight tracking-tight">Couldn&apos;t load the latest data</h1>
        <p className="max-w-xl text-sm leading-relaxed text-ink-2">
          The Stage Two engine didn&apos;t answer, so nothing is shown rather than an older copy. This is usually brief.
        </p>
        {error.digest && <p className="num text-xs text-ink-3">Error {error.digest}</p>}
        <button onClick={retry} className="mt-2 rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm text-ink hover:border-ink">
          Try again
        </button>
      </div>
    </Page>
  );
}
