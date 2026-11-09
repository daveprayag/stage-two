import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, X } from "lucide-react";
import { Change, PhaseLabel, phaseDetail, RsMeter, StageLabel, TAG_LABEL } from "@/components/Badges";
import { AiSummary, Sources } from "@/components/NewsPanel";
import { Card, CardHeader, Page } from "@/components/Page";
import { PriceChart } from "@/components/PriceChart";
import { stockDetail } from "@/engine/detail";
import { isTopSetup, topSetupChecks } from "@/engine/topsetup";
import { fetchHeadlines } from "@/engine/news";
import { crore, price, titleCase } from "@/lib/format";
import { getAllRows, getFilings, getScreen, getStore } from "@/lib/data";

export const revalidate = 3600;

/** Rendered on first visit, then cached for an hour (and refreshed after each nightly run). */
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol).toUpperCase() };
}

function Fact({ label, children, hint, note }: { label: string; children: React.ReactNode; hint?: string; note?: string }) {
  return (
    <div title={hint} className="bg-surface px-4 py-2.5 sm:px-5 sm:py-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num mt-1 text-[15px] text-ink">{children}</dd>
      {note && <dd className="mt-0.5 text-[11px] leading-snug text-ink-3">{note}</dd>}
    </div>
  );
}

export default async function StockPage({ params }: Props) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const [store, screen, rows] = await Promise.all([getStore(), getScreen(), getAllRows()]);
  if (!store) notFound();
  const row = rows.get(symbol);
  const d = stockDetail(store, symbol, row);
  if (!d) notFound();
  const last = d.bars[d.bars.length - 1]!;
  const prev = d.bars[d.bars.length - 2];
  const chg = prev ? (last.close / prev.close - 1) * 100 : 0;
  const shortlisted = screen?.news[symbol];
  const filings = shortlisted?.filings.length ? shortlisted.filings : await getFilings(symbol);
  const headlines = shortlisted?.headlines ?? (await fetchHeadlines(d.name, symbol).catch(() => []));
  const passed = d.checklist.filter((c) => c.pass).length;
  const top = row ? isTopSetup(row, shortlisted) : false;
  const topChecks = row ? topSetupChecks(row, shortlisted) : [];
  const topPassed = topChecks.filter((c) => c.pass).length;
  const screens = [...(top ? ["Top setup"] : []), ...(row?.tags ?? []).filter((t) => t !== "ankur" && t !== "qualified").map((t) => TAG_LABEL[t])];
  const fromHigh = (1 - last.close / d.hi52) * 100;

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Link href="/" className="-ml-1 inline-flex w-fit items-center gap-0.5 text-sm text-ink-2 hover:text-ink">
          <ChevronLeft className="h-4 w-4" /> Screener
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-display text-[2.75rem] leading-none tracking-tight sm:text-6xl">{d.symbol}</h1>
            <p className="mt-2 text-sm text-ink-2">{titleCase(d.name)}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              {d.industry ?? "Industry not classified"}
              {d.band !== null ? ` · ${d.band}% price band` : ""}
            </p>
          </div>
          <div className="sm:text-right">
            <div className="num text-3xl text-ink">{price(last.close)}</div>
            <div className="mt-1 text-sm">
              <Change value={chg} digits={2} /> <span className="text-ink-3">· close {last.time}</span>
            </div>
          </div>
        </div>
        {row && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <StageLabel stage={row.stage} age={row.stageAge} />
            {row.phase && (
              <>
                <span className="text-ink-3">·</span>
                <span>
                  <PhaseLabel phase={row.phase} stage={row.stage} /> in the uptrend ({phaseDetail(row.rallies, row.riseFromBase).toLowerCase()})
                </span>
              </>
            )}
            {screens.length > 0 && (
              <>
                <span className="text-ink-3">·</span>
                <span>{screens.join(", ")}</span>
              </>
            )}
            {(row.scans.length > 0 || row.setup) && (
              <>
                <span className="text-ink-3">·</span>
                <span>Ankur&apos;s scans: {[...row.scans, ...(row.setup ? [`${row.setup} setup`] : [])].join(", ")}</span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4 sm:p-5">
            <PriceChart d={d} />
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Red line: resistance, the nearest price above where the stock turned down before (a close above it is a breakout). Green line: support, the nearest price below where it bounced before. &quot;2 touches&quot; = it turned there twice; more touches, stronger level. Trendlines: sloped lines through rising lows or falling highs, off by default.
            </p>
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              <Fact label="RS rating" hint="Relative Strength rating, 1–99: 3–12 month performance ranked against all liquid NSE stocks" note={row ? `Beat ${row.rs}% of NSE stocks` : undefined}>{row ? <RsMeter rs={row.rs} /> : "—"}</Fact>
              <Fact label="From 52-week high">{fromHigh < 0.05 ? "At high" : `−${fromHigh.toFixed(1)}%`}</Fact>
              <Fact label="1 month"><Change value={row?.ret1m} /></Fact>
              <Fact label="3 months"><Change value={row?.ret3m} /></Fact>
              <Fact label="10-day range" hint="High–low range of the last 10 sessions as % of price">{row ? `${row.tight10.toFixed(1)}%` : "—"}</Fact>
              <Fact label="Volume 5/50" hint="Below 1 means volume is drying up">{row ? row.dryUp.toFixed(2) : "—"}</Fact>
              <Fact label="Avg daily value" hint="50-day average traded value">{row ? crore(row.turnoverCr) : "—"}</Fact>
              <Fact label="Next resistance">{row?.resistance ? price(row.resistance) : "None nearby"}</Fact>
            </dl>
          </Card>
        </div>

        <Card className={top ? "border-up" : ""}>
          <CardHeader
            title={row ? "Top setup checks" : "Trend template"}
            aside={
              row ? (
                <span className={`num text-sm ${top ? "text-up" : "text-ink-2"}`}>
                  {topPassed} of {topChecks.length}
                </span>
              ) : (
                <span className="num text-sm text-ink-2">{passed} of 8</span>
              )
            }
          />
          <p className="px-4 pt-1 text-xs leading-relaxed text-ink-3 sm:px-5">
            {!row ? "This stock is outside the liquid universe the screener ranks." : top ? "Passes every check. Not a guarantee: decide your stop before you buy." : "A top setup must pass all of these."}
          </p>
          <ul className="mt-2 divide-y divide-line">
            {(row ? topChecks : []).map((c) => (
              <li key={c.key} className="px-4 py-2.5 sm:px-5">
                <div className="flex gap-3">
                  <CheckIcon pass={c.pass} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-ink">{c.label}</div>
                    <div className="num mt-0.5 text-xs text-ink-3">{c.value}</div>
                  </div>
                </div>
                {c.key === "template" && (
                  <details className="group mt-2 ml-7">
                    <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                      Show the 8 points
                      <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                    </summary>
                    <TemplateList items={d.checklist} />
                  </details>
                )}
              </li>
            ))}
          </ul>
          {!row && (
            <div className="px-4 pb-4 sm:px-5">
              <TemplateList items={d.checklist} />
            </div>
          )}
        </Card>
      </div>

      {shortlisted?.ai ? (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <AiSummary ai={shortlisted.ai} />
          <Sources filings={filings} headlines={headlines} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-3">
            No AI news summary for this stock today: the nightly job summarises the 60 strongest candidates. Its filings and headlines are below.
          </p>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Sources filings={filings} headlines={headlines} />
          </div>
        </div>
      )}
    </Page>
  );
}

function CheckIcon({ pass }: { pass: boolean }) {
  return pass ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-label="Pass" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-label="Fail" />;
}

function TemplateList({ items }: { items: { label: string; pass: boolean; value: string }[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((c) => (
        <li key={c.label} className="flex gap-2.5">
          <CheckIcon pass={c.pass} />
          <div className="min-w-0">
            <div className="text-[13px] text-ink-2">{c.label}</div>
            <div className="num text-[11px] text-ink-3">{c.value}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
