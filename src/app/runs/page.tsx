import type { Metadata } from "next";
import { ChevronDown } from "lucide-react";
import { Card, Page, PageTitle } from "@/components/Page";
import { getRuns } from "@/lib/data";
import { istTime } from "@/lib/format";

export const metadata: Metadata = { title: "Runs" };
export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const data = await getRuns();
  const runs = data?.runs ?? [];
  const eod = data?.eod ?? null;
  const filings = data?.filings ?? null;
  const live = data?.live ?? null;
  const JOB = { eod: "Prices", news: "News", filings: "Filings", live: "Live prices" } as const;
  const SOURCE: Record<string, string> = { cloudflare: "scheduled", vercel: "old Vercel cron", manual: "manual" };
  return (
    <Page narrow>
      <PageTitle title="Runs">
        Everything runs on a Cloudflare Worker. From 5:30 pm IST it checks every 15 minutes for the day&apos;s NSE file; as soon as it is out it updates the
        prices, rebuilds the screen and adds the news. During market hours it refreshes live prices for the shortlisted stocks every 5 minutes and checks NSE
        filings every 30. Checks that find nothing new are not listed.
      </PageTitle>
      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line text-sm sm:grid-cols-3">
        <div className="bg-surface px-4 py-3 sm:px-5">
          <dt className="text-xs text-ink-3">Last check for NSE prices</dt>
          <dd className="mt-1 text-ink">{eod?.lastCheck ? istTime(eod.lastCheck) : "—"}</dd>
        </div>
        <div className="bg-surface px-4 py-3 sm:px-5">
          <dt className="text-xs text-ink-3">Last check for NSE filings</dt>
          <dd className="mt-1 text-ink">{filings?.lastCheck ? istTime(filings.lastCheck) : "—"}</dd>
        </div>
        <div className="bg-surface px-4 py-3 sm:px-5">
          <dt className="text-xs text-ink-3">Last live-price refresh</dt>
          <dd className="mt-1 text-ink">{live?.lastRun ? istTime(live.lastRun) : "—"}</dd>
        </div>
      </dl>
      <Card>
        <ul className="divide-y divide-line">
          {runs.slice(0, 120).map((r) => (
            <li key={`${r.job}-${r.startedAt}`}>
              <details className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3.5 sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${r.ok ? "bg-up" : "bg-down"}`} aria-label={r.ok ? "Succeeded" : "Failed"} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-ink">
                        {JOB[r.job]}
                        {r.source && <span className="ml-2 text-xs font-normal text-ink-3">{SOURCE[r.source] ?? r.source}</span>}
                      </span>
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
