"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { NewsBundle, ScreenRow, ScreenTag } from "@/engine/types";
import { price, titleCase } from "@/lib/format";
import { Change, RsMeter, SentimentDot, stageAge, StageLabel } from "./Badges";
import { Select } from "./Select";

type TabKey = ScreenTag | "all";
type SortKey = "score" | "rs" | "high" | "tight" | "move";

export const SCREENS: { key: TabKey; label: string; short: string; blurb: string }[] = [
  {
    key: "breakout",
    label: "Breaking out",
    short: "Broke above a multi-week ceiling today on heavy volume",
    blurb: "Closed above the top of a sideways range of 8+ weeks today, on at least 1.5× normal volume, while in an uptrend.",
  },
  {
    key: "setup",
    label: "Tight near highs",
    short: "Quiet and narrow, close to its 52-week high",
    blurb: "Uptrend intact (7–8 of the 8 trend checks), within 15% of the 52-week high, a narrow 10-day range and falling volume. Often what a stock looks like just before it breaks out.",
  },
  {
    key: "fresh2",
    label: "New uptrends",
    short: "Turned into an uptrend in the last 6 weeks",
    blurb: "Moved from going sideways or down into an uptrend (price above a rising 150-day average) within the last 30 sessions, with RS 70+. The earliest point a new leader shows up.",
  },
  {
    key: "leader",
    label: "Strongest",
    short: "Top 10% performers, uptrend intact",
    blurb: "RS rating 90 or more (beat 90% of NSE stocks over the past year) with the uptrend still intact.",
  },
  {
    key: "ankur",
    label: "Ankur's scans",
    short: "His own Chartink scans fired today",
    blurb: "Ankur Patel's Chartink scans (volume expansion, 20 EMA pullback, flag) or one of his setups from the Livermore rule engine fired today.",
  },
  { key: "all", label: "All", short: "Everything above, ranked", blurb: "Every stock on at least one list." },
];

const SORTS: { key: SortKey; label: string; fn: (a: ScreenRow, b: ScreenRow) => number }[] = [
  { key: "score", label: "Best match", fn: (a, b) => b.score - a.score },
  { key: "rs", label: "Relative strength", fn: (a, b) => b.rs - a.rs },
  { key: "high", label: "Closest to 52-week high", fn: (a, b) => a.pctFromHigh - b.pctFromHigh },
  { key: "tight", label: "Tightest range", fn: (a, b) => a.tight10 - b.tight10 },
  { key: "move", label: "Today's move", fn: (a, b) => b.chgPct - a.chgPct },
];

const href = (r: ScreenRow) => `/stock/${encodeURIComponent(r.symbol)}`;
const fromHigh = (r: ScreenRow) => (r.pctFromHigh < 0.05 ? "At high" : `−${r.pctFromHigh.toFixed(1)}%`);

function MobileItem({ r, n }: { r: ScreenRow; n: NewsBundle | undefined }) {
  return (
    <li>
      <Link href={href(r)} className="flex items-center gap-3 px-4 py-4 active:bg-surface-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-[15px] font-medium text-ink">{r.symbol}</span>
            <span className="num shrink-0 text-[15px] text-ink">{price(r.close)}</span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink-3">{r.industry ?? titleCase(r.name)}</span>
            <Change value={r.chgPct} className="shrink-0" />
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
            <div>
              <dt className="text-ink-3">RS</dt>
              <dd className="num mt-0.5 text-ink">{r.rs}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Stage</dt>
              <dd className={`num mt-0.5 ${r.stage === 2 ? "text-up" : "text-ink"}`}>
                {r.stage}
                {r.stage === 2 && r.stageAge !== null && <span className="text-ink-3"> · {stageAge(r.stageAge)}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">From high</dt>
              <dd className="num mt-0.5 text-ink">{fromHigh(r)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">10d range</dt>
              <dd className="num mt-0.5 text-ink">{r.tight10.toFixed(1)}%</dd>
            </div>
          </dl>
          {n?.ai && n.ai.sentiment !== "none" && (
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-ink-2">
              <SentimentDot s={n.ai.sentiment} className="mt-[5px]" />
              <span className="line-clamp-2">{n.ai.summary}</span>
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
      </Link>
    </li>
  );
}

const th = "px-3 py-3 text-xs font-normal text-ink-3 first:pl-5 last:pr-5";
const td = "px-3 py-3.5 first:pl-5 last:pr-5";

function DesktopTable({ rows, news }: { rows: ScreenRow[]; news: Record<string, NewsBundle> }) {
  return (
    <table className="w-full table-fixed text-sm">
      <colgroup>
        <col className="w-[22%]" />
        <col className="w-[10%]" />
        <col className="w-[9%]" />
        <col className="w-[11%]" />
        <col className="w-[9%]" />
        <col className="w-[8%]" />
        <col className="w-[7%]" />
        <col />
      </colgroup>
      <thead className="border-b border-line">
        <tr className="text-left">
          <th className={th}>Stock</th>
          <th className={`${th} text-right`}>Close</th>
          <th className={th} title="Relative strength rating, 1–99">RS</th>
          <th className={th}>Stage</th>
          <th className={`${th} text-right`} title="Distance below the 52-week high">From high</th>
          <th className={`${th} text-right`} title="10-day high–low range as % of price">10d range</th>
          <th className={`${th} text-right`} title="5-day vs 50-day average volume; below 1 means drying up">Vol 5/50</th>
          <th className={th}>News</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-line">
        {rows.map((r) => {
          const n = news[r.symbol];
          return (
            <tr key={r.isin} className="relative transition-colors hover:bg-surface-2/70">
              <td className={td}>
                <Link href={href(r)} className="block after:absolute after:inset-0">
                  <span className="font-medium text-ink">{r.symbol}</span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">{r.industry ?? titleCase(r.name)}</span>
                </Link>
              </td>
              <td className={`${td} text-right`}>
                <span className="num block text-ink">{price(r.close)}</span>
                <Change value={r.chgPct} className="text-xs" />
              </td>
              <td className={td}>
                <RsMeter rs={r.rs} />
              </td>
              <td className={`${td} text-xs`}>
                <StageLabel stage={r.stage} age={r.stageAge} />
              </td>
              <td className={`${td} num text-right text-ink`}>{fromHigh(r)}</td>
              <td className={`${td} num text-right ${r.tight10 <= 8 ? "text-up" : "text-ink"}`}>{r.tight10.toFixed(1)}%</td>
              <td className={`${td} num text-right ${r.dryUp <= 0.8 ? "text-up" : "text-ink"}`}>{r.dryUp.toFixed(2)}</td>
              <td className={td}>
                {n?.ai && n.ai.sentiment !== "none" ? (
                  <span className="flex items-start gap-2 text-xs leading-relaxed text-ink-2" title={n.ai.summary}>
                    <SentimentDot s={n.ai.sentiment} className="mt-[5px]" />
                    <span className="line-clamp-2">{n.ai.summary}</span>
                  </span>
                ) : (
                  <span className="text-xs text-ink-3">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const TERMS: [string, string][] = [
  ["RS", "Relative Strength rating, 1–99. Ranks how much the stock rose over 3, 6, 9 and 12 months against all ~1,350 liquid NSE stocks (last 3 months count double). 90 = beat 90% of the market. Not the same as RSI."],
  ["Stage", "Where the stock is in its cycle, from its 150-day average: 1 sideways base, 2 uptrend, 3 topping, 4 downtrend. \u201c2 · 14d\u201d = in an uptrend for 14 sessions."],
  ["From high", "How far below its 52-week high it closed."],
  ["10d range", "Gap between the highest and lowest price of the last 10 sessions, as % of price. Small = quiet, tight."],
  ["Vol 5/50", "Average volume of the last 5 days ÷ last 50 days. Below 1 = volume drying up; well above 1 = heavy buying or selling."],
  ["News dot", "Green positive, red negative, grey neutral, from a Gemini summary of NSE filings and headlines."],
];

function Glossary() {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-ink-2 [&::-webkit-details-marker]:hidden">
        What the numbers mean
        <ChevronDown className="h-4 w-4 text-ink-3 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <dl className="grid gap-x-8 gap-y-3 border-t border-line px-4 py-4 text-sm md:grid-cols-2">
        {TERMS.map(([t, d]) => (
          <div key={t}>
            <dt className="font-medium text-ink">{t}</dt>
            <dd className="mt-0.5 leading-relaxed text-ink-2">{d}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

const control = "h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-line-strong md:h-9";

export function ScreenerTable({ rows, news }: { rows: ScreenRow[]; news: Record<string, NewsBundle> }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) for (const t of r.tags) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [rows]);
  const [tab, setTab] = useState<TabKey>(() => (counts.breakout ? "breakout" : "setup"));
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [positive, setPositive] = useState(false);
  // The open tab lives in the URL (?tab=setup) so a view can be shared or bookmarked.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && SCREENS.some((x) => x.key === t)) setTab(t as TabKey);
  }, []);
  const choose = (t: TabKey) => {
    setTab(t);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", t);
    window.history.replaceState(null, "", url);
  };
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.industry).filter((x): x is string => !!x))].sort(), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toUpperCase();
    const fn = SORTS.find((s) => s.key === sort)?.fn ?? SORTS[0]!.fn;
    return rows
      .filter(
        (r) =>
          (tab === "all" || r.tags.includes(tab)) &&
          (!sector || r.industry === sector) &&
          (!positive || news[r.symbol]?.ai?.sentiment === "positive") &&
          (!needle || r.symbol.includes(needle) || r.name.toUpperCase().includes(needle)),
      )
      .sort(fn);
  }, [rows, tab, q, sector, sort, positive, news]);

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Screens" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {SCREENS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              role="radio"
              aria-checked={on}
              onClick={() => choose(t.key)}
              className={`flex flex-col rounded-xl border p-3 text-left transition-colors ${on ? "border-ink bg-surface" : "border-line hover:border-line-strong"}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-medium ${on ? "text-ink" : "text-ink-2"}`}>{t.label}</span>
                <span className="num text-xs text-ink-3">{counts[t.key] ?? 0}</span>
              </span>
              <span className="mt-1 text-xs leading-snug text-ink-3">{t.short}</span>
            </button>
          );
        })}
      </div>

      <p className="text-sm leading-relaxed text-ink-2">{SCREENS.find((t) => t.key === tab)?.blurb}</p>

      <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
        <label className={`${control} col-span-2 flex items-center gap-2 md:w-72`}>
          <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search symbol or name" aria-label="Search" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
        </label>
        <Select label="Sector" value={sector} onChange={setSector} options={[{ value: "", label: "All" }, ...sectors.map((x) => ({ value: x, label: x }))]} className="min-w-0 md:w-60" />
        <Select label="Sort" value={sort} onChange={(v) => setSort(v as SortKey)} options={SORTS.map((x) => ({ value: x.key, label: x.label }))} className="min-w-0 md:w-56" />
      </div>

      <Glossary />

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-xs text-ink-3 md:px-5">
          <span>
            <span className="num text-ink-2">{shown.length}</span> {shown.length === 1 ? "stock" : "stocks"}
          </span>
          <button role="switch" aria-checked={positive} onClick={() => setPositive((p) => !p)} className="flex items-center gap-2 py-1 text-ink-2">
            Positive news only
            <span className={`relative h-5 w-9 rounded-full transition-colors ${positive ? "bg-up" : "bg-line-strong"}`}>
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${positive ? "left-[18px]" : "left-0.5"}`} />
            </span>
          </button>
        </div>
        {shown.length ? (
          <>
            <ul className="divide-y divide-line md:hidden">
              {shown.map((r) => (
                <MobileItem key={r.isin} r={r} n={news[r.symbol]} />
              ))}
            </ul>
            <div className="hidden md:block">
              <DesktopTable rows={shown} news={news} />
            </div>
          </>
        ) : (
          <p className="px-4 py-12 text-center text-sm text-ink-3">Nothing matches today. Screens like this are often empty when the market is weak.</p>
        )}
      </div>
    </div>
  );
}
