import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, X } from "lucide-react";
import { Change, RsMeter, StageLabel, TAG_LABEL } from "@/components/Badges";
import { AiSummary, Sources } from "@/components/NewsPanel";
import { Card, CardHeader, Page } from "@/components/Page";
import { PriceChart } from "@/components/PriceChart";
import { stockDetail } from "@/engine/detail";
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
  const screens = (row?.tags ?? []).filter((t) => t !== "ankur").map((t) => TAG_LABEL[t]);
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
            {screens.length > 0 && (
              <>
                <span className="text-ink-3">·</span>
                <span>{screens.join(", ")}</span>
              </>
            )}
          </p>
        )}
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          <Fact label="RS rating" hint="Relative Strength rating, 1–99: 3–12 month performance ranked against all liquid NSE stocks" note={row ? `Beat ${row.rs}% of NSE stocks over the past year` : undefined}>{row ? <RsMeter rs={row.rs} /> : "—"}</Fact>
          <Fact label="From 52-week high">{fromHigh < 0.05 ? "At high" : `−${fromHigh.toFixed(1)}%`}</Fact>
          <Fact label="1 month"><Change value={row?.ret1m} /></Fact>
          <Fact label="3 months"><Change value={row?.ret3m} /></Fact>
          <Fact label="10-day range" hint="High–low range of the last 10 sessions as % of price">{row ? `${row.tight10.toFixed(1)}%` : "—"}</Fact>
          <Fact label="Volume 5/50" hint="Below 1 means volume is drying up">{row ? row.dryUp.toFixed(2) : "—"}</Fact>
          <Fact label="Avg daily value" hint="50-day average traded value">{row ? crore(row.turnoverCr) : "—"}</Fact>
          <Fact label="Next resistance">{row?.resistance ? price(row.resistance) : "None nearby"}</Fact>
        </dl>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4 sm:p-5">
            <PriceChart d={d} />
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Dashed: support (green) and resistance (red) where price has turned before. Solid: the longest trendline through rising lows or falling highs that price hasn&apos;t closed through.
            </p>
          </Card>
          <AiSummary ai={shortlisted?.ai ?? null} />
        </div>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader title="Trend template" aside={<span className={`num text-sm ${passed >= 7 ? "text-up" : passed >= 5 ? "text-amber" : "text-down"}`}>{passed} of 8</span>} />
            <ul className="mt-2 divide-y divide-line">
              {d.checklist.map((c) => (
                <li key={c.label} className="flex gap-3 px-4 py-2.5 sm:px-5 sm:py-3">
                  {c.pass ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-label="Pass" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-label="Fail" />}
                  <div className="min-w-0">
                    <div className="text-sm text-ink">{c.label}</div>
                    <div className="num mt-0.5 text-xs text-ink-3">{c.value}</div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          {row && (row.scans.length > 0 || row.setup) && (
            <Card>
              <CardHeader title="Ankur Patel's scans today" />
              <ul className="space-y-1.5 px-4 pt-2 pb-4 text-sm text-ink-2 sm:px-5 sm:pb-5">
                {row.scans.map((s) => (
                  <li key={s}>{s}</li>
                ))}
                {row.setup && <li>Rule-engine setup: {row.setup}</li>}
              </ul>
            </Card>
          )}
        </div>
      </div>

      <Sources filings={filings} headlines={headlines} />
    </Page>
  );
}
