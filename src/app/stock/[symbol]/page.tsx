import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Check, X } from "lucide-react";
import { RsBar, StagePill, TagBadge } from "@/components/Badges";
import { NewsPanel } from "@/components/NewsPanel";
import { PriceChart } from "@/components/PriceChart";
import { stockDetail } from "@/engine/detail";
import { fetchHeadlines } from "@/engine/news";
import { crore, pct, price } from "@/lib/format";
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

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "up" | "down" }) {
  return (
    <div title={hint} className="rounded-lg border border-line bg-surface px-3 py-2">
      <div className="text-[11px] text-ink-3">{label}</div>
      <div className={`num mt-0.5 text-sm ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>{value}</div>
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

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <Link href="/" className="inline-flex w-fit items-center gap-1 text-sm text-ink-2 hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Screener
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-4xl leading-none tracking-tight sm:text-5xl">{d.symbol}</h1>
            {row && <StagePill stage={row.stage} age={row.stageAge} />}
            {row?.tags.filter((t) => t !== "ankur").map((t) => <TagBadge key={t} tag={t} />)}
          </div>
          <p className="mt-2 text-sm text-ink-2">
            {d.name}
            {d.industry ? ` · ${d.industry}` : ""}
            {d.band !== null ? ` · ${d.band}% price band` : ""}
          </p>
        </div>
        <div className="sm:text-right">
          <div className="num text-3xl">{price(last.close)}</div>
          <div className={`num text-sm ${chg >= 0 ? "text-up" : "text-down"}`}>
            {pct(chg, 2)} <span className="text-ink-3">· close {last.time}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        <div title="Relative strength rating, 1–99" className="rounded-lg border border-line bg-surface px-3 py-2">
          <div className="text-[11px] text-ink-3">RS rating</div>
          <div className="mt-1">{row ? <RsBar rs={row.rs} /> : <span className="num text-sm">—</span>}</div>
        </div>
        <Stat label="From 52-wk high" value={pct(-((1 - last.close / d.hi52) * 100))} />
        <Stat label="1 month" value={pct(row?.ret1m)} tone={(row?.ret1m ?? 0) >= 0 ? "up" : "down"} />
        <Stat label="3 months" value={pct(row?.ret3m)} tone={(row?.ret3m ?? 0) >= 0 ? "up" : "down"} />
        <Stat label="10-day range" value={row ? `${row.tight10.toFixed(1)}%` : "—"} hint="High–low range of the last 10 sessions as % of price" />
        <Stat label="Volume 5/50" value={row ? row.dryUp.toFixed(2) : "—"} hint="Below 1 = volume drying up" />
        <Stat label="Avg daily value" value={row ? crore(row.turnoverCr) : "—"} hint="50-day average traded value" />
        <Stat label="Next resistance" value={row?.resistance ? `${price(row.resistance)} (${pct(row.pctToResistance)})` : "none nearby"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <section className="min-w-0 rounded-xl border border-line bg-surface p-3 sm:p-4">
          <PriceChart d={d} />
          <p className="mt-3 text-xs text-ink-3">
            Dashed lines: support (S) and resistance (R) levels where price turned at least once in the last ~10 months, with the number of touches.
            Solid lines: the longest trendline through rising lows (support) or falling highs (resistance) that price has not closed through.
          </p>
        </section>
        <aside className="flex flex-col gap-4">
          <section className="rounded-xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">Trend template</h2>
              <span className={`num text-sm ${passed >= 7 ? "text-up" : passed >= 5 ? "text-amber" : "text-down"}`}>{passed}/8</span>
            </div>
            <ul className="mt-3 space-y-2.5">
              {d.checklist.map((c) => (
                <li key={c.label} className="flex gap-2 text-sm">
                  {c.pass ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-down" />}
                  <span>
                    <span className="text-ink">{c.label}</span>
                    <span className="num block text-xs text-ink-3">{c.value}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
          {row && (row.scans.length > 0 || row.setup) && (
            <section className="rounded-xl border border-line bg-surface p-4">
              <h2 className="text-sm font-medium">Ankur Patel&apos;s scans today</h2>
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                {row.scans.map((s) => (
                  <li key={s}>· {s}</li>
                ))}
                {row.setup && <li>· Rule-engine setup: {row.setup}</li>}
              </ul>
            </section>
          )}
        </aside>
      </div>

      <NewsPanel ai={shortlisted?.ai ?? null} filings={filings} headlines={headlines} />
    </div>
  );
}
