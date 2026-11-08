import type { Metadata } from "next";
import { getRuns } from "@/lib/data";
import { istTime } from "@/lib/format";

export const metadata: Metadata = { title: "Runs" };
export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = (await getRuns()) ?? [];
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Nightly runs</h1>
        <p className="mt-1 text-sm text-ink-2">
          Every evening at about 9 pm IST the price job adds the day&apos;s NSE bhavcopy (catching up any missed days) and rebuilds the screen;
          at about 10:30 pm the news job adds filings, headlines and summaries. Each run&apos;s log is kept here.
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {runs.slice(0, 120).map((r) => (
          <li key={`${r.job}-${r.startedAt}`} className="rounded-xl border border-line bg-surface">
            <details>
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
                <span className={`h-2 w-2 rounded-full ${r.ok ? "bg-up" : "bg-down"}`} aria-label={r.ok ? "succeeded" : "failed"} />
                <span className="w-12 font-medium">{r.job === "eod" ? "Prices" : "News"}</span>
                <span className="num text-xs text-ink-3">{istTime(r.startedAt)}</span>
                <span className="num text-xs text-ink-3">{((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000).toFixed(0)} s</span>
                <span className="basis-full text-ink-2 sm:basis-auto">{r.detail}</span>
              </summary>
              <pre className="num overflow-x-auto border-t border-line px-4 py-3 text-xs leading-relaxed whitespace-pre-wrap text-ink-2">{r.log.join("\n")}</pre>
            </details>
          </li>
        ))}
        {!runs.length && <li className="text-sm text-ink-3">No runs yet.</li>}
      </ul>
    </div>
  );
}
