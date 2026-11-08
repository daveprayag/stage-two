import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { Card, Page, PageTitle } from "@/components/Page";
import { getRuns } from "@/lib/data";
import { istTime } from "@/lib/format";

export const metadata: Metadata = { title: "Runs" };
export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const runs = (await getRuns()) ?? [];
  return (
    <Page narrow>
      <PageTitle title="Nightly runs">
        At about 9 pm IST the price job adds the day&apos;s NSE data (catching up any missed days) and rebuilds the screen. At about 10:30 pm the news job adds
        filings, headlines and summaries. Every run&apos;s log is kept here.
      </PageTitle>
      <Card>
        <ul className="divide-y divide-line">
          {runs.slice(0, 120).map((r) => (
            <li key={`${r.job}-${r.startedAt}`}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.ok ? "bg-up" : "bg-down"}`} aria-label={r.ok ? "Succeeded" : "Failed"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">{r.job === "eod" ? "Prices" : "News"}</span>
                      <span className="num shrink-0 text-xs text-ink-3">
                        {istTime(r.startedAt)} · {((Date.parse(r.finishedAt) - Date.parse(r.startedAt)) / 1000).toFixed(0)}s
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-2">{r.detail}</p>
                  </div>
                  <ChevronDown className="mt-1 h-4 w-4 shrink-0 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <pre className="num mx-4 mb-4 overflow-x-auto rounded-lg bg-surface-2 p-3 text-xs leading-relaxed whitespace-pre-wrap text-ink-2 sm:mx-5">{r.log.join("\n")}</pre>
              </details>
            </li>
          ))}
          {!runs.length && <li className="px-4 py-10 text-center text-sm text-ink-3">No runs yet.</li>}
        </ul>
      </Card>
    </Page>
  );
}
