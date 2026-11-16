"use client";
/**
 * The holdings list: each holding is one row with its position, price trend and business; tap it for the details
 * (the buy plan, the trend facts and the last quarters). The checks above the list filter it, and the line under them
 * says what each check means and whether it was tested.
 * Price trend: the laggard test (livermore DECISIONS.md / EXPERIMENTS "HOLDINGS", 2026-11-16). Business: NSE results
 * filings for held stocks only; not tested. No buy or sell calls: the user decides and places every order.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import type { BizTrend, BizView } from "@/engine/business";
import { SMALL_WEIGHT, type HoldingRow } from "@/engine/holdings";
import { int, price } from "@/lib/format";
import { Change, RsMeter, shortDay } from "./Badges";
import { PlanLines } from "./PlanLines";
import { Select } from "./Select";
import { displayName } from "./names";
import { changeOver, PriceCostChart, QuarterBars, Sparkline } from "./charts/StockCharts";
import type { HoldingsHistory } from "@/engine/portfolio";
import { signedPct } from "./charts/base";

/** Results of the laggard test, next 6 months vs the average liquid stock (EXPERIMENTS "HOLDINGS"). */
const TESTED_WEAK =
  "Stocks in a falling trend with RS under 30 trailed the average stock by about 5–6 points over the next 6 months in 2012–24 (behind in about 4 of every 5 months), and by about 2 points in 2025–26. They were not certain losers: the gap to other stocks was the cost.";
const TESTED_DEEP =
  "Stocks in a falling trend and 30%+ below their 52-week high did not bounce back on average. They trailed the average stock by about 7–8 points over the next 6 months in 2012–24, and by about 2 points in 2025–26.";
const BIZ_RULE = "Latest quarter against the same quarter a year earlier. Growing = revenue and net profit both up 10%+ with a profit; shrinking = revenue down, profit down 10%+, or a loss.";
const UNTESTED_BIZ = "Whether a growing business makes a weak stock worth holding has not been checked on past data, so read it as context, not evidence.";


const rupees = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : `₹${int(Math.round(x))}`);

export function Money({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={`num text-ink-3 ${className}`}>—</span>;
  const r = Math.round(value);
  return (
    <span className={`num ${r > 0 ? "text-up" : r < 0 ? "text-down" : "text-ink-2"} ${className}`}>
      {r > 0 ? "+" : r < 0 ? "−" : ""}₹{int(Math.abs(r))}
    </span>
  );
}

/** Crore amount without the unit (the column header carries "₹Cr"). */
const cr = (x: number | null) => {
  if (x === null || !Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  return `${x < 0 ? "−" : ""}${a >= 100 ? int(Math.round(a)) : a.toFixed(1)}`;
};

// ---------------------------------------------------------------- what each row says

interface Reading {
  label: string;
  dot: string;
  text: string;
}

function trendOf(r: HoldingRow): Reading {
  if (r.etf) return { label: "ETF", dot: "bg-ink-3", text: "text-ink-3" };
  if (!r.inScreen || r.stage === null) return { label: "No reading", dot: "bg-line-strong", text: "text-ink-3" };
  if (r.momentum) return { label: "Momentum leader", dot: "bg-up", text: "text-up" };
  if (r.stage === 2) return { label: "Uptrend", dot: "bg-up", text: "text-up" };
  if (r.stage === 3) return { label: "Topping", dot: "bg-amber", text: "text-amber" };
  if (r.stage === 4) return { label: "Falling", dot: "bg-down", text: "text-down" };
  return { label: "Basing", dot: "bg-ink-3", text: "text-ink-2" };
}

const BIZ: Record<BizTrend, Reading> = {
  growing: { label: "Growing", dot: "bg-up", text: "text-up" },
  mixed: { label: "Mixed", dot: "bg-ink-3", text: "text-ink-2" },
  shrinking: { label: "Shrinking", dot: "bg-down", text: "text-down" },
};

function bizOf(r: HoldingRow): Reading {
  if (r.etf) return { label: "—", dot: "", text: "text-ink-3" };
  const t = r.business?.trend;
  if (t) return BIZ[t];
  return { label: r.business ? "Not enough history" : "No results yet", dot: "bg-line-strong", text: "text-ink-3" };
}

function Dot({ reading, children }: { reading: Reading; children?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {reading.dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${reading.dot}`} aria-hidden="true" />}
      <span className={reading.text}>{reading.label}</span>
      {children}
    </span>
  );
}

/** "weak", "deep" or "weak · deep" after a falling trend: the price pictures the laggard test judged. */
function WeakTag({ r }: { r: HoldingRow }) {
  if (!r.weak && !r.deep) return null;
  return <span className="text-[11px] text-down">· {[r.weak && "weak", r.deep && "deep"].filter(Boolean).join(", ")}</span>;
}

/** Things to look at today: the plan's sell signals first, then results and news. */
function alertsOf(r: HoldingRow): { text: string; tone: string }[] {
  const out: { text: string; tone: string }[] = [];
  if (r.lots.some((l) => l.belowStop)) out.push({ text: "Below the plan's stop", tone: "text-down" });
  else if (r.lots.some((l) => l.due)) out.push({ text: "Six months are up", tone: "text-amber" });
  if (r.resultsDrop) out.push({ text: "Fell on results", tone: "text-down" });
  if (r.redFlag) out.push({ text: "Negative news", tone: "text-down" });
  return out;
}

const planSays = (r: HoldingRow) => r.lots.some((l) => l.belowStop || l.due);

// ---------------------------------------------------------------- checks (filters) and sorting

type CheckKey = "all" | "plan" | "weak" | "deep" | "shrinking" | "small";
interface Check {
  key: CheckKey;
  label: string;
  test: (r: HoldingRow) => boolean;
  tested?: boolean;
  note: string;
}

const CHECKS: Check[] = [
  {
    key: "all",
    label: "All",
    test: () => true,
    note: "Tap a holding for its buy plan, trend and last quarters. What you paid doesn't change where a stock goes next, so the question for each one is whether you would buy it today. Nothing here is a buy or sell call: you decide and place every order.",
  },
  { key: "plan", label: "Plan says sell", test: planSays, tested: true, note: "Buys since tracking began whose tested plan (stop at the 10-day low before the buy, hold 6 months) now says sell." },
  { key: "weak", label: "Weak trend", test: (r) => r.weak, tested: true, note: `Falling trend (stage 4) with RS under 30. Tested over 2011–26: ${TESTED_WEAK}` },
  { key: "deep", label: "Deep below high", test: (r) => r.deep, tested: true, note: `Falling trend and 30%+ below the 52-week high. Tested over 2011–26: ${TESTED_DEEP}` },
  { key: "shrinking", label: "Shrinking business", test: (r) => r.business?.trend === "shrinking", tested: false, note: `${BIZ_RULE} Not tested: ${UNTESTED_BIZ}` },
  {
    key: "small",
    label: "Small positions",
    test: (r) => r.weight !== null && r.weight < SMALL_WEIGHT,
    note: `Positions under ${SMALL_WEIGHT}% of the money barely move the total either way; folding them into fewer, larger holdings makes each one count.`,
  },
];

const SORTS = [
  { value: "size", label: "Biggest first" },
  { value: "gain", label: "Gain %, best first" },
  { value: "loss", label: "Gain %, worst first" },
  { value: "today", label: "Today's move" },
  { value: "name", label: "Name" },
];

function sorter(by: string): (a: HoldingRow, b: HoldingRow) => number {
  const n = (x: number | null) => x ?? Number.NEGATIVE_INFINITY;
  if (by === "gain") return (a, b) => n(b.pnlPct) - n(a.pnlPct);
  if (by === "loss") return (a, b) => n(a.pnlPct === null ? Infinity : a.pnlPct) - n(b.pnlPct === null ? Infinity : b.pnlPct);
  if (by === "today") return (a, b) => n(b.dayPct) - n(a.dayPct);
  if (by === "name") return (a, b) => displayName(a).localeCompare(displayName(b));
  return (a, b) => n(b.value) - n(a.value);
}

function TestedTag({ tested }: { tested: boolean }) {
  return (
    <span className={`rounded px-1 py-px text-[10px] tracking-wide uppercase ${tested ? "bg-surface-2 text-ink-2" : "bg-amber-soft text-amber"}`}>{tested ? "tested" : "untested"}</span>
  );
}

// ---------------------------------------------------------------- one row

function WeightBar({ w }: { w: number | null }) {
  return (
    <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <span className="block h-full rounded-full bg-ink-3" style={{ width: `${Math.min(100, ((w ?? 0) / 25) * 100)}%` }} />
    </span>
  );
}

function bizLine(b: BizView | null): React.ReactNode {
  const last = b?.quarters[b.quarters.length - 1];
  if (!b || !last || (last.revenueYoY === null && last.profitYoY === null)) return b?.pe != null ? <>P/E {b.pe.toFixed(0)}</> : null;
  return (
    <>
      {last.label} · rev <Change value={last.revenueYoY} digits={0} /> · profit <Change value={last.profitYoY} digits={0} />
    </>
  );
}

function trendLine(r: HoldingRow): React.ReactNode {
  if (r.etf) return "no single business";
  if (!r.inScreen || r.rs === null) return "not screened";
  return (
    <>
      RS <span className={r.rs < 30 ? "text-down" : ""}>{r.rs}</span>
      {r.pctFromHigh !== null && (
        <>
          {" · "}
          <span className={r.deep ? "text-down" : ""}>{r.pctFromHigh < 1 ? "at its high" : `${r.pctFromHigh.toFixed(0)}% off high`}</span>
        </>
      )}
    </>
  );
}

const COLS =
  "md:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.5fr)_1rem] xl:grid-cols-[minmax(0,2.2fr)_minmax(0,0.95fr)_7.5rem_minmax(0,1.1fr)_minmax(0,0.95fr)_minmax(0,1.25fr)_minmax(0,1.45fr)_1rem]";

function Row({ r, open, onToggle, history }: { r: HoldingRow; open: boolean; onToggle: () => void; history: HoldingsHistory | null }) {
  const name = displayName(r);
  const t = trendOf(r);
  const b = bizOf(r);
  const alerts = alertsOf(r);
  const id = `h-${r.isin}`;
  const closes = history?.closes[r.symbol];
  const m3 = changeOver(closes);
  const sub = `${r.symbol} · ${r.sectorName}`;
  return (
    <li id={`row-${r.isin}`} className={`scroll-mt-24 ${open ? "bg-surface-2/40" : ""}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id} className="block w-full text-left transition-colors hover:bg-surface-2/60 focus-visible:bg-surface-2/60 focus-visible:outline-none">
        {/* Phones */}
        <div className="flex flex-col gap-2 px-4 py-3.5 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[15px] font-medium text-ink">{name}</div>
              <div className="truncate text-xs text-ink-3">{sub}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="num text-[15px] text-ink">{rupees(r.value)}</div>
              <div className="text-xs">
                <Change value={r.pnlPct} /> <span className="text-ink-3">· {r.weight !== null ? `${r.weight.toFixed(1)}%` : "—"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <Dot reading={t}>
              <WeakTag r={r} />
            </Dot>
            {!r.etf && <Dot reading={b} />}
            {alerts.map((a) => (
              <span key={a.text} className={a.tone}>
                {a.text}
              </span>
            ))}
          </div>
        </div>
        {/* Larger screens */}
        <div className={`hidden items-center gap-x-4 px-5 py-3.5 md:grid ${COLS}`}>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-medium text-ink" title={name}>
              {name}
            </div>
            <div className="truncate text-xs text-ink-3">
              {sub}
              {alerts.map((a) => (
                <span key={a.text} className={a.tone}>
                  {" · "}
                  {a.text}
                </span>
              ))}
            </div>
          </div>
          <div className="text-right">
            <div className="num text-sm text-ink">{price(r.price)}</div>
            <div className="text-xs">
              <Change value={r.dayPct} digits={2} />
            </div>
          </div>
          <div className="hidden items-center justify-end gap-2 xl:flex" title="Last 3 months">
            <Sparkline closes={closes} />
            <span className={`num w-10 text-right text-[11px] ${m3 === null ? "text-ink-3" : m3 >= 0 ? "text-up" : "text-down"}`}>{m3 === null ? "" : signedPct(m3, 0)}</span>
          </div>
          <div className="text-right">
            <div className="num text-sm text-ink">{rupees(r.value)}</div>
            <div className="flex items-center justify-end gap-1.5 text-xs text-ink-3">
              <WeightBar w={r.weight} />
              <span className="num w-9">{r.weight !== null ? `${r.weight.toFixed(1)}%` : "—"}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm">
              <Money value={r.pnl} />
            </div>
            <div className="text-xs">
              <Change value={r.pnlPct} />
            </div>
          </div>
          <div className="min-w-0 text-sm">
            <Dot reading={t}>
              <WeakTag r={r} />
            </Dot>
            <div className="truncate pl-3 text-xs text-ink-3">{trendLine(r)}</div>
          </div>
          <div className="min-w-0 text-sm">
            <Dot reading={b}>{r.business && r.business.streak > 1 && r.business.trend ? <span className="text-xs text-ink-3">· {r.business.streak} qtrs</span> : null}</Dot>
            {!r.etf && <div className="truncate pl-3 text-xs text-ink-3">{bizLine(r.business)}</div>}
          </div>
          <ChevronDown className={`h-4 w-4 text-ink-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </div>
      </button>
      {open && <Detail id={id} r={r} history={history} />}
    </li>
  );
}

// ---------------------------------------------------------------- the details under a row

function Panel({ title, aside, children, className = "" }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 ${className}`}>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide text-ink-3 uppercase">
        {title}
        {aside}
      </h3>
      {children}
    </section>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="text-right text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Position({ r }: { r: HoldingRow }) {
  const src = r.priceFrom === "nse" ? "live" : r.priceFrom === "paytm" ? "Paytm Money" : "last close";
  return (
    <Panel title="Your position">
      <Facts
        items={[
          ["Quantity", <span key="q" className="num">{int(r.qty)}</span>],
          ["Average cost", <span key="a" className="num">₹{price(r.avg)}</span>],
          [
            "Price",
            <span key="p" className="num">
              ₹{price(r.price)} <span className="text-xs text-ink-3">{src}</span>
            </span>,
          ],
          ["Invested", <span key="i" className="num">{rupees(r.invested)}</span>],
          [
            "Gain",
            <span key="g">
              <Money value={r.pnl} /> <Change value={r.pnlPct} className="text-xs" />
            </span>,
          ],
          ["Today", <Money key="t" value={r.dayPnl} />],
        ]}
      />
      {!r.etf && r.lots.length > 0 && (
        <div className="mt-3 border-t border-dashed border-line pt-2.5">
          <PlanLines lots={r.lots} etf={r.etf} />
        </div>
      )}
    </Panel>
  );
}

function Trend({ r }: { r: HoldingRow }) {
  const t = trendOf(r);
  if (!r.inScreen || r.stage === null || r.rs === null) {
    return (
      <Panel title="Price trend">
        <p className="text-sm text-ink-3">Not in the screened stocks (too new, too thin or under ₹30), so there&apos;s no trend reading.</p>
      </Panel>
    );
  }
  return (
    <Panel title="Price trend" aside={r.weak || r.deep ? <TestedTag tested /> : undefined}>
      <Facts
        items={[
          [
            "Trend",
            <span key="s" className={t.text}>
              {t.label} <span className="text-ink-3">(stage {r.stage})</span>
            </span>,
          ],
          [
            "Relative strength",
            <span key="rs" className="inline-flex justify-end">
              <RsMeter rs={r.rs} />
            </span>,
          ],
          ["From 52-week high", <span key="h" className={`num ${r.deep ? "text-down" : ""}`}>{r.pctFromHigh === null ? "—" : r.pctFromHigh < 1 ? "at the high" : `−${r.pctFromHigh.toFixed(0)}%`}</span>],
        ]}
      />
      {(r.weak || r.deep) && (
        <p className="mt-3 text-xs leading-relaxed text-ink-2">
          <span className="text-down">{r.weak && r.deep ? "Weak and deep below its high." : r.weak ? "Weak: falling, RS under 30." : "Deep: falling, 30%+ below its high."}</span> {r.deep ? TESTED_DEEP : TESTED_WEAK}
        </p>
      )}
      {(r.resultsDrop || r.redFlag) && (
        <p className="mt-2 text-xs text-down">
          {[r.resultsDrop && "Fell 5%+ on heavy volume after its latest results.", r.redFlag && "The news summary is negative or found a red flag."].filter(Boolean).join(" ")}
        </p>
      )}
    </Panel>
  );
}

function Business({ r }: { r: HoldingRow }) {
  const b = r.business;
  if (!b) {
    return (
      <Panel title="Business">
        <p className="text-sm text-ink-3">No quarterly results on NSE yet. They are read within half an hour of a new holding showing up.</p>
      </Panel>
    );
  }
  const reading = bizOf(r);
  const rev = b.revenueKind === "interest" ? "Interest" : b.revenueKind === "income" ? "Income" : "Revenue";
  return (
    <Panel title="Business" aside={<TestedTag tested={false} />}>
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <Dot reading={reading}>{b.trend && b.streak > 1 ? <span className="text-xs text-ink-3">· {b.streak} quarters in a row</span> : null}</Dot>
        {(b.ttmRevenueYoY !== null || b.ttmProfitYoY !== null) && (
          <span className="text-xs text-ink-3">
            Last 4 quarters: rev <Change value={b.ttmRevenueYoY} digits={0} /> · profit <Change value={b.ttmProfitYoY} digits={0} />
          </span>
        )}
        {b.pe !== null && <span className="text-xs text-ink-3">P/E {b.pe.toFixed(0)}</span>}
      </p>
      <div className="mt-3">
        <QuarterBars b={b} />
      </div>
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-ink-3 hover:text-ink [&::-webkit-details-marker]:hidden">
          <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
          The numbers, with growth and margin
        </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-xs whitespace-nowrap">
          <thead className="text-ink-3">
            <tr className="border-b border-line">
              <th className="py-1.5 pr-2 text-left font-normal">Quarter</th>
              <th className="px-2 text-right font-normal">{rev} ₹Cr</th>
              <th className="px-2 text-right font-normal">YoY</th>
              <th className="px-2 text-right font-normal">Profit ₹Cr</th>
              <th className="px-2 text-right font-normal">YoY</th>
              <th className="pl-2 text-right font-normal">Margin</th>
            </tr>
          </thead>
          <tbody>
            {[...b.quarters].reverse().map((q) => (
              <tr key={q.qe} className="border-b border-line/60 last:border-0">
                <td className="py-1.5 pr-2 text-ink-2">
                  <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${q.trend ? BIZ[q.trend].dot : "bg-line-strong"}`} title={q.trend ? BIZ[q.trend].label : "No year-earlier quarter"} />
                  {q.label}
                </td>
                <td className="num px-2 text-right text-ink">{cr(q.revenueCr)}</td>
                <td className="px-2 text-right">
                  <Change value={q.revenueYoY} digits={0} />
                </td>
                <td className={`num px-2 text-right ${q.profitCr !== null && q.profitCr < 0 ? "text-down" : "text-ink"}`}>{cr(q.profitCr)}</td>
                <td className="px-2 text-right">
                  <Change value={q.profitYoY} digits={0} />
                </td>
                <td className="num pl-2 text-right text-ink-2">{q.margin === null ? "—" : `${q.margin.toFixed(1)}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </details>
      <p className="mt-2 text-[11px] leading-relaxed text-ink-3">
        {b.basis} results from NSE filings, latest filed {shortDay(b.latestFiled)} {b.latestFiled.slice(0, 4)}. {BIZ_RULE} Not tested: {UNTESTED_BIZ}
      </p>
    </Panel>
  );
}

function Detail({ id, r, history }: { id: string; r: HoldingRow; history: HoldingsHistory | null }) {
  const closes = history?.closes[r.symbol];
  const chart =
    history && closes && r.avg > 0 ? (
      <Panel title="Price against your cost">
        <PriceCostChart dates={history.dates} closes={closes} avg={r.avg} stop={r.lots.find((l) => l.stop !== null)?.stop ?? null} now={r.priceFrom === "nse" ? r.price : null} />
      </Panel>
    ) : null;
  return (
    <div id={id} className="flex flex-col gap-7 border-t border-dashed border-line px-4 pt-5 pb-5 md:px-5">
      <div className={`grid grid-cols-1 gap-7 ${chart ? "lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]" : "md:grid-cols-2"}`}>
        {chart}
        <Position r={r} />
      </div>
      {r.etf ? (
        <p className="text-sm text-ink-3">An ETF holds many companies or a commodity, so there is no single business or trend reading to review.</p>
      ) : (
        <div className="grid grid-cols-1 gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
          <Trend r={r} />
          <div className="min-w-0">
            <Business r={r} />
          </div>
        </div>
      )}
      <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="inline-flex items-center gap-1 self-start text-xs text-ink-2 hover:text-ink hover:underline">
        Full chart, news and filings for {displayName(r)}
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------- the list

export function HoldingsList({ rows, toolbar, history, focus }: { rows: HoldingRow[]; toolbar?: React.ReactNode; history: HoldingsHistory | null; focus: { isin: string; n: number } | null }) {
  const [check, setCheck] = useState<CheckKey>("all");
  const [sort, setSort] = useState("size");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const counts = useMemo(
    () =>
      Object.fromEntries(
        CHECKS.map((c) => {
          const xs = rows.filter(c.test);
          return [c.key, { n: xs.length, weight: xs.reduce((a, r) => a + (r.weight ?? 0), 0) }];
        }),
      ) as Record<CheckKey, { n: number; weight: number }>,
    [rows],
  );
  const active = CHECKS.find((c) => c.key === check) ?? CHECKS[0]!;
  const shown = rows.filter(active.test).sort(sorter(sort));
  const allOpen = shown.length > 0 && shown.every((r) => open.has(r.isin));
  const toggle = (isin: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(isin)) n.delete(isin);
      else n.add(isin);
      return n;
    });
  // A tap on a chart opens that holding here and scrolls to it.
  useEffect(() => {
    if (!focus) return;
    setCheck((c) => (CHECKS.find((x) => x.key === c)?.test(rows.find((r) => r.isin === focus.isin) as HoldingRow) ? c : "all"));
    setOpen((s) => new Set(s).add(focus.isin));
    requestAnimationFrame(() => document.getElementById(`row-${focus.isin}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [focus, rows]);
  const undated = rows.filter((r) => !r.etf && r.lots.length > 0 && r.lots.every((l) => !l.date)).length;

  return (
    <section aria-label="Your holdings" className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Show">
          {CHECKS.filter((c) => c.key === "all" || counts[c.key].n > 0).map((c) => {
            const on = c.key === check;
            const k = counts[c.key];
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() => setCheck(on ? "all" : c.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                  on ? "border-ink bg-ink text-bg" : "border-line-strong text-ink-2 hover:border-ink hover:text-ink"
                }`}
              >
                {c.key !== "all" && c.key !== "small" && <span className={`h-1.5 w-1.5 rounded-full ${c.key === "plan" ? "bg-amber" : "bg-down"}`} aria-hidden="true" />}
                {c.label}
                <span className={`num ${on ? "text-bg/70" : "text-ink-3"}`}>
                  {k.n}
                  {c.key !== "all" ? ` · ${k.weight.toFixed(0)}%` : ""}
                </span>
              </button>
            );
          })}
        </div>
        <p className="flex flex-wrap items-baseline gap-x-2 px-1 text-xs leading-relaxed text-ink-3">
          {active.tested !== undefined && <TestedTag tested={active.tested} />}
          <span className="min-w-0 flex-1">{active.note}</span>
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Select label="Sort" value={sort} options={SORTS} onChange={setSort} className="w-60" />
          <button
            type="button"
            onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map((r) => r.isin)))}
            className="h-10 rounded-lg border border-line px-3 text-sm text-ink-2 hover:border-line-strong hover:text-ink md:h-9"
          >
            {allOpen ? "Collapse all" : "Expand all"}
          </button>
        </div>
        {toolbar}
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className={`hidden gap-x-4 border-b border-line px-5 py-2.5 text-xs text-ink-3 md:grid ${COLS}`}>
          <span>Holding</span>
          <span className="text-right">Price · today</span>
          <span className="hidden text-right xl:block">3 months</span>
          <span className="text-right">Value · share</span>
          <span className="text-right">Gain</span>
          <span>Price trend</span>
          <span>Business</span>
          <span />
        </div>
        {shown.length ? (
          <ul className="divide-y divide-line">
            {shown.map((r) => (
              <Row key={r.isin} r={r} open={open.has(r.isin)} onToggle={() => toggle(r.isin)} history={history} />
            ))}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-3">No holding matches this check.</p>
        )}
      </div>
      {undated > 0 && (
        <p className="px-1 text-xs leading-relaxed text-ink-3">
          {undated} {undated === 1 ? "holding was" : "holdings were"} bought before tracking began, so {undated === 1 ? "it has" : "they have"} no stop or sell date yet. Buys
          from now on get them automatically.
        </p>
      )}
    </section>
  );
}
