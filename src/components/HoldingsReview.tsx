"use client";
/**
 * Holdings review: facts to decide what to keep, with each one marked tested or untested. No buy or sell calls.
 * Price picture: the laggard test (livermore DECISIONS.md / EXPERIMENTS "HOLDINGS", 2026-11-16). Business trend: NSE
 * results filings; its own test ("weak price but a growing business") waits for the 15-year results history.
 */
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import type { BizTrend, BizView } from "@/engine/business";
import { SECTOR_LIMIT, SMALL_WEIGHT, type HoldingRow, type HoldingsSummary } from "@/engine/holdings";
import { int } from "@/lib/format";
import { Change, shortDay } from "./Badges";
import { Card } from "./Page";

/** Results of the laggard test, next 6 months vs the average liquid stock (EXPERIMENTS "HOLDINGS"). */
const TESTED_WEAK = "Tested over 2011–26: stocks in a falling trend with RS under 30 trailed the average stock by about 5–6 points over the next 6 months in 2012–24 (behind in about 4 of every 5 months), and by about 2 points in 2025–26. They were not certain losers: the gap to other stocks was the cost.";
const TESTED_DEEP = "Tested over 2011–26: stocks in a falling trend and 30%+ below their high did not bounce back on average. They trailed the average stock by about 7–8 points over the next 6 months in 2012–24, and by about 2 points in 2025–26.";
const UNTESTED_BIZ = "Not tested yet. Whether a growing business makes a weak stock worth holding is being tested on 15 years of NSE results; until then, read this as context, not evidence.";

const TREND: Record<BizTrend, { label: string; tone: string }> = {
  growing: { label: "Growing", tone: "border-up/40 text-up" },
  mixed: { label: "Mixed", tone: "border-line-strong text-ink-2" },
  shrinking: { label: "Shrinking", tone: "border-down/40 text-down" },
};

const cr = (x: number | null) => {
  if (x === null || !Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  return `${x < 0 ? "−" : ""}₹${a >= 100 ? int(Math.round(a)) : a.toFixed(1)} Cr`;
};

function Chip({ tone, children, title }: { tone: string; children: React.ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded-full border px-1.5 py-px text-[11px] leading-4 ${tone}`}>
      {children}
    </span>
  );
}

function Tag({ tested }: { tested: boolean }) {
  return (
    <span className={`ml-1 rounded px-1 py-px text-[10px] uppercase tracking-wide ${tested ? "bg-surface-2 text-ink-2" : "bg-amber/15 text-amber"}`}>
      {tested ? "tested" : "untested"}
    </span>
  );
}

function Portfolio({ s, rows }: { s: HoldingsSummary; rows: HoldingRow[] }) {
  const r = s.review;
  const big = r.sectors.filter((x) => x.sector !== "ETFs").slice(0, 4);
  const stocks = rows.filter((x) => !x.etf).length;
  const b = r.business;
  return (
    <Card>
      <ul className="divide-y divide-line text-sm">
        <li className="px-4 py-3 sm:px-5">
          <p className="text-ink">
            {r.small.n ? (
              <>
                {r.small.n} small {r.small.n === 1 ? "position" : "positions"} under {SMALL_WEIGHT}% each, <span className="num">{r.small.weight.toFixed(1)}%</span> of the money together
              </>
            ) : (
              <>No position under {SMALL_WEIGHT}% of the money</>
            )}
          </p>
          {r.small.n > 0 && (
            <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
              {r.small.symbols.join(", ")}. Positions this size barely move the total either way; folding them into fewer, larger holdings makes each one count.
            </p>
          )}
        </li>
        <li className="px-4 py-3 sm:px-5">
          <p className="text-ink">Biggest sectors</p>
          <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
            {big.map((x) => (
              <span key={x.sector} className={x.weight > SECTOR_LIMIT ? "text-amber" : ""}>
                {x.sector} <span className="num">{x.weight.toFixed(0)}%</span> ({x.n})
                {x.weight > SECTOR_LIMIT ? " · over " + SECTOR_LIMIT + "%" : ""}
              </span>
            ))}
          </p>
        </li>
        <li className="px-4 py-3 sm:px-5">
          <p className="text-ink">
            {r.weak.n || r.deep.n ? (
              <>
                {r.weak.n} weak-trend {r.weak.n === 1 ? "holding" : "holdings"} (<span className="num">{r.weak.weight.toFixed(0)}%</span> of the money)
                {r.deep.n ? (
                  <>
                    {" "}
                    · {r.deep.n} deep below {r.deep.n === 1 ? "its" : "their"} high (<span className="num">{r.deep.weight.toFixed(0)}%</span>)
                  </>
                ) : null}
              </>
            ) : (
              "No holding is in a weak trend"
            )}
            <Tag tested />
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{TESTED_WEAK}</p>
        </li>
        <li className="px-4 py-3 sm:px-5">
          <p className="text-ink">
            Business, latest quarter vs a year earlier: <span className="text-up">{b.growing} growing</span> · {b.mixed} mixed · <span className="text-down">{b.shrinking} shrinking</span>
            {b.unknown ? ` · ${b.unknown} not enough history` : ""}
            <Tag tested={false} />
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
            Of {stocks} stocks. Growing = revenue and net profit both up 10%+ with a profit; shrinking = revenue down, profit down 10%+, or a loss. {UNTESTED_BIZ}
          </p>
        </li>
      </ul>
    </Card>
  );
}

/** One line on where the price and the business stand together. */
function situation(r: HoldingRow): { text: string; tone: string } | null {
  const t = r.business?.trend ?? null;
  const weak = r.weak || r.deep;
  if (weak && t === "growing") return { text: "Weak price, growing business", tone: "text-amber" };
  if (weak && t === "shrinking") return { text: "Weak price, shrinking business", tone: "text-down" };
  if (weak) return { text: "Weak price", tone: "text-down" };
  if ((r.momentum || r.stage === 2) && t === "shrinking") return { text: "Strong price, shrinking business", tone: "text-amber" };
  if (r.momentum && t === "growing") return { text: "Strong price, growing business", tone: "text-up" };
  return null;
}

function priceLine(r: HoldingRow): string {
  if (!r.inScreen) return "Not in the screened stocks (too new, too thin or below ₹30), so no trend reading";
  const stage = r.stage === 2 ? "Uptrend" : r.stage === 4 ? "Falling trend" : r.stage === 3 ? "Topping" : "Basing";
  const parts = [r.momentum ? "Momentum leader" : `${stage} (stage ${r.stage})`, `RS ${r.rs}`];
  if (r.pctFromHigh !== null) parts.push(r.pctFromHigh < 1 ? "at its 52-week high" : `${r.pctFromHigh.toFixed(0)}% below its 52-week high`);
  return parts.join(" · ");
}

function Quarters({ b }: { b: BizView }) {
  const rev = b.revenueKind === "interest" ? "Interest earned" : b.revenueKind === "income" ? "Total income" : "Revenue";
  return (
    <details className="group mt-2">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        Last {b.quarters.length} quarters ({b.basis.toLowerCase()})
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-xs">
          <thead className="text-ink-3">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-2 text-left font-normal">Quarter</th>
              <th className="px-2 text-right font-normal">{rev}</th>
              <th className="px-2 text-right font-normal">YoY</th>
              <th className="px-2 text-right font-normal">Net profit</th>
              <th className="px-2 text-right font-normal">YoY</th>
              <th className="px-2 text-right font-normal">Margin</th>
              <th className="pl-2 text-right font-normal">Trend</th>
            </tr>
          </thead>
          <tbody>
            {[...b.quarters].reverse().map((q) => (
              <tr key={q.qe} className="border-b border-line/60 last:border-0">
                <td className="py-1.5 pr-2 text-ink-2">{q.label}</td>
                <td className="num px-2 text-right text-ink">{cr(q.revenueCr)}</td>
                <td className="px-2 text-right">
                  <Change value={q.revenueYoY} digits={0} />
                </td>
                <td className={`num px-2 text-right ${q.profitCr !== null && q.profitCr < 0 ? "text-down" : "text-ink"}`}>{cr(q.profitCr)}</td>
                <td className="px-2 text-right">
                  <Change value={q.profitYoY} digits={0} />
                </td>
                <td className="num px-2 text-right text-ink-2">{q.margin === null ? "—" : `${q.margin.toFixed(1)}%`}</td>
                <td className={`pl-2 text-right ${q.trend === "growing" ? "text-up" : q.trend === "shrinking" ? "text-down" : "text-ink-3"}`}>{q.trend ? TREND[q.trend].label : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-3">From NSE results filings; latest filed {shortDay(b.latestFiled)} {b.latestFiled.slice(0, 4)}. Growth is against the same quarter a year earlier.</p>
    </details>
  );
}

function Business({ b }: { b: BizView | null }) {
  if (!b) return <p className="text-xs text-ink-3">No results on NSE yet</p>;
  const last = b.quarters[b.quarters.length - 1]!;
  return (
    <div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
        {b.trend ? (
          <Chip tone={TREND[b.trend].tone}>
            {TREND[b.trend].label}
            {b.streak > 1 ? ` · ${b.streak} quarters` : ""}
          </Chip>
        ) : (
          <Chip tone="border-line text-ink-3">Not enough history</Chip>
        )}
        {(last.revenueYoY !== null || last.profitYoY !== null) && (
          <span>
            {last.label}: revenue <Change value={last.revenueYoY} digits={0} />, profit <Change value={last.profitYoY} digits={0} />
          </span>
        )}
        {(b.ttmRevenueYoY !== null || b.ttmProfitYoY !== null) && (
          <span className="text-ink-3">
            · last 4 quarters: revenue <Change value={b.ttmRevenueYoY} digits={0} />, profit <Change value={b.ttmProfitYoY} digits={0} />
          </span>
        )}
        {b.pe !== null && <span className="text-ink-3">· P/E {b.pe.toFixed(0)}</span>}
      </p>
      <Quarters b={b} />
    </div>
  );
}

/** Weak or deep first, then shrinking businesses, then by size. */
const order = (r: HoldingRow) => (r.weak || r.deep ? 0 : r.business?.trend === "shrinking" ? 1 : 2);

export function HoldingsReview({ s, rows }: { s: HoldingsSummary; rows: HoldingRow[] }) {
  const stocks = rows.filter((r) => !r.etf).sort((a, b) => order(a) - order(b) || (b.weight ?? 0) - (a.weight ?? 0));
  const etfs = rows.filter((r) => r.etf);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="review-h">
      <div className="px-1 pt-2">
        <h2 id="review-h" className="text-base font-medium text-ink">
          Review
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-3">
          Facts for deciding what to keep, each marked tested or untested. What you paid doesn&apos;t change where a stock goes next, so the question for each one is whether
          you would buy it today. Nothing here is a buy or sell call; you decide and place every order.
        </p>
      </div>
      <Portfolio s={s} rows={rows} />
      <Card>
        <ul className="divide-y divide-line">
          {stocks.map((r) => {
            const sit = situation(r);
            return (
              <li key={r.isin} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="text-[15px] font-medium text-ink hover:underline">
                      {r.symbol}
                    </Link>
                    {sit && <span className={`text-xs ${sit.tone}`}>{sit.text}</span>}
                  </div>
                  <span className="text-xs text-ink-3">
                    <span className="num">{r.weight !== null ? `${r.weight.toFixed(1)}%` : "—"}</span> of the money · gain <Change value={r.pnlPct} digits={0} />
                  </span>
                </div>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                  {r.weak && (
                    <Chip tone="border-down/40 text-down" title={TESTED_WEAK}>
                      Weak trend · tested
                    </Chip>
                  )}
                  {r.deep && (
                    <Chip tone="border-down/40 text-down" title={TESTED_DEEP}>
                      Deep below high · tested
                    </Chip>
                  )}
                  {r.resultsDrop && <Chip tone="border-down/40 text-down">Fell on results</Chip>}
                  <span className={r.inScreen ? "" : "text-ink-3"}>{priceLine(r)}</span>
                </p>
                <div className="mt-1.5">
                  <Business b={r.business} />
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
      {etfs.length > 0 && (
        <p className="px-1 text-xs text-ink-3">
          ETFs ({etfs.map((e) => e.symbol).join(", ")}) hold many companies or a commodity, so they have no single business to review.
        </p>
      )}
    </section>
  );
}
