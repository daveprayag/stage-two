"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { NewsBundle, ScreenRow } from "@/engine/types";
import { price, titleCase } from "@/lib/format";
import { baseShort, Change, FirstLine, PhaseLabel, phaseDetail, phaseNote, RsMeter, SentimentDot, StageLabel, StarMark } from "./Badges";
import { isStar, starCount } from "@/engine/star";
import { Select } from "./Select";
import { freshFor, liveLabel, useLiveFile } from "./live";

/** A stock's latest NSE price during or after today's session. */
type Px = { last: number; pChange: number };

type TabKey = "leader" | "momentum" | "resuming";
type SortKey = "score" | "rs" | "high" | "tight" | "move";

/**
 * The three lists that earned their place in livermore's research (2021–26, liquid NSE stocks, 6-month outcomes): strength
 * is what found big gainers; tight ranges, breakouts and the all-checks list found them less often than a random stock in
 * 2025–26. The engine still tags and tracks the removed lists (track.ts), it just doesn't show them.
 */
export const SCREENS: { key: TabKey; label: string; mobile: string; short: string; blurb: string }[] = [
  {
    key: "leader",
    label: "Strongest",
    mobile: "Strongest",
    short: "Top 10% performers, uptrend intact",
    blurb:
      "RS 90+ (beat 90% of NSE stocks over the past year) with the uptrend intact. In our tests the list most likely to hold the big gainers: 35% of such stocks rose 50%+ within 6 months in 2021–24 (vs 23% of all stocks) and 17% in 2025–26 (vs 13%). About 1 in 5 also fell 20%+, so use a stop and own several.",
  },
  {
    key: "momentum",
    label: "Momentum leaders",
    mobile: "Momentum",
    short: "Strong, volatile, in a strong sector",
    blurb:
      "RS 80+, bigger daily swings than most stocks (top 40%), industry in the top 40% by 3-month return, in stage 2. Similar odds to Strongest (35% rose 50%+ in 2021–24, 17% in 2025–26) with more sector support; the stars come from this list. A shortlist to research, not a buy list.",
  },
  {
    key: "resuming",
    label: "Resuming after a pause",
    mobile: "Resuming",
    short: "Rallied, paused, now moving again",
    blurb:
      "Rallied 20%+, paused for 5+ sessions without falling more than 25%, and closed back above the top of the pause in the last 5 sessions (now no more than 8% above it). The when, not the what: on average no better than any uptrend day, but the low of the pause is a natural, close stop. Best used on stocks that are also Strongest or Momentum leaders.",
  },
];

const SORTS: { key: SortKey; label: string; fn: (a: ScreenRow, b: ScreenRow) => number }[] = [
  { key: "score", label: "Best match", fn: (a, b) => b.score - a.score },
  { key: "rs", label: "Relative strength", fn: (a, b) => b.rs - a.rs },
  { key: "high", label: "Closest to 52-week high", fn: (a, b) => a.pctFromHigh - b.pctFromHigh },
  { key: "tight", label: "Tightest range", fn: (a, b) => a.tight10 - b.tight10 },
  { key: "move", label: "Today's move", fn: (a, b) => b.chgPct - a.chgPct },
];

type PhaseFilter = "all" | "early" | "earlyMid";
const PHASES: { key: PhaseFilter; label: string; hint: string }[] = [
  { key: "all", label: "All phases", hint: "Every stock, however far into its uptrend. Use Early to hide stocks that have already run." },
  { key: "early", label: "Early only", hint: "Only stocks in the first rally out of their base, the phase Ankur calls the best buy." },
  { key: "earlyMid", label: "Early + mid", hint: "Hides late stocks: third rally or later, or after an 80%+ run." },
];
const phaseOk = (r: ScreenRow, p: PhaseFilter) => p === "all" || r.phase === "early" || (p === "earlyMid" && r.phase === "mid");

const href = (r: ScreenRow) => `/stock/${encodeURIComponent(r.symbol)}`;
const fromHigh = (r: ScreenRow) => (r.pctFromHigh < 0.05 ? "At high" : `−${r.pctFromHigh.toFixed(1)}%`);

function MobileItem({ r, n, q }: { r: ScreenRow; n: NewsBundle | undefined; q: Px | undefined }) {
  return (
    <li>
      <Link href={href(r)} className="flex items-center gap-3 px-4 py-4 active:bg-surface-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[15px] font-medium text-ink">{r.symbol}</span>
              {isStar(r, n) && <StarMark count={starCount(r, n)} />}
            </span>
            <span className="num flex shrink-0 items-center gap-1.5 text-[15px] text-ink">
              {price(q ? q.last : r.close)}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs">
            <span className="truncate text-ink-3">{r.industry ?? titleCase(r.name)}</span>
            <Change value={q ? q.pChange : r.chgPct} className="shrink-0" />
          </div>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-xs">
            <div>
              <dt className="text-ink-3">RS</dt>
              <dd className="num mt-0.5 text-ink">{r.rs}</dd>
            </div>
            <div>
              <dt className="text-ink-3">Phase</dt>
              <dd className="mt-0.5">
                <PhaseLabel phase={r.phase} stage={r.stage} />
                {phaseNote(r) && <span className="mt-0.5 block text-[11px] leading-tight text-ink-3">{phaseNote(r)}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-ink-3">Above base</dt>
              <dd className="num mt-0.5 text-ink">{baseShort(r)}</dd>
            </div>
            <div>
              <dt className="text-ink-3">From high</dt>
              <dd className="num mt-0.5 text-ink">{fromHigh(r)}</dd>
            </div>
          </dl>
          {n?.ai && n.ai.sentiment !== "none" && (
            <p className="mt-3 flex items-start gap-2.5 text-xs leading-relaxed text-ink-2">
              <FirstLine>
                <SentimentDot s={n.ai.sentiment} />
              </FirstLine>
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

function DesktopTable({ rows, news, live }: { rows: ScreenRow[]; news: Record<string, NewsBundle>; live: Record<string, Px> }) {
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
          <th className={th} title="Stage, and for stage 2 how far into the uptrend: early (first rally), mid (second), late (third+ or an 80%+ rally)">Stage · phase</th>
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
                  <span className="flex items-center gap-1.5">
                    <span className="font-medium text-ink">{r.symbol}</span>
                    {isStar(r, n) && <StarMark count={starCount(r, n)} />}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-3">{r.industry ?? titleCase(r.name)}</span>
                </Link>
              </td>
              <td className={`${td} text-right`}>
                <span className="num flex items-center justify-end gap-1.5 text-ink">
                  {price(live[r.symbol]?.last ?? r.close)}
                </span>
                <Change value={live[r.symbol]?.pChange ?? r.chgPct} className="text-xs" />
              </td>
              <td className={td}>
                <RsMeter rs={r.rs} />
              </td>
              <td className={`${td} text-xs`}>
                <StageLabel stage={r.stage} />
                {r.phase && (
                  <span className="mt-1 block whitespace-nowrap">
                    <PhaseLabel phase={r.phase} stage={r.stage} />
                    <span className="text-ink-3"> · {phaseDetail(r).replace(" above base", "")}</span>
                  </span>
                )}
              </td>
              <td className={`${td} num text-right text-ink`}>{fromHigh(r)}</td>
              <td className={`${td} num text-right ${r.tight10 <= 8 ? "text-up" : "text-ink"}`}>{r.tight10.toFixed(1)}%</td>
              <td className={`${td} num text-right ${r.dryUp <= 0.8 ? "text-up" : "text-ink"}`}>{r.dryUp.toFixed(2)}</td>
              <td className={td}>
                {n?.ai && n.ai.sentiment !== "none" ? (
                  <span className="flex items-start gap-2.5 text-xs leading-relaxed text-ink-2" title={n.ai.summary}>
                    <FirstLine>
                <SentimentDot s={n.ai.sentiment} />
              </FirstLine>
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
  ["RSI", "Relative Strength Index (14 days), 0–100: momentum of recent price moves. Above ~70 is usually called overbought, but the strongest stocks often stay there for weeks."],
  ["Stage", "Where the stock is in its cycle, from its 150-day average: 1 sideways base, 2 uptrend, 3 topping, 4 downtrend."],
  ["Phase", "How far into its uptrend a stage 2 stock is, counted from when it left its latest base (8+ weeks sideways within a 35% range). A rally is a rise of 20%+ without a 10% pullback. Early = still in the base, just out of it, or in the first rally (Ankur's best buy: the first pause after the base); mid = second rally; late = third or later, any 80%+ rally, or no sideways base in the last 14 months. \u201cAbove base\u201d = how far the price is above the top of that base."],
  ["From high", "How far below its 52-week high it closed."],
  ["10d range", "Gap between the highest and lowest price of the last 10 sessions, as % of price. Small = quiet, tight."],
  ["Vol 5/50", "Average volume of the last 5 days ÷ last 50 days. Below 1 = volume drying up; well above 1 = heavy buying or selling."],
  ["\u2605 Star", "A momentum leader that passes at least 5 of the 6 checks from the Guide: momentum profile, early or mid phase, RS 90+, sector moving as a group (3+ strong stocks), positive news without red flags, and resuming after a pause with a stop within 12%. The stock page lists each check."],
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

function Toggle({ on, set, label }: { on: boolean; set: (f: (x: boolean) => boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} onClick={() => set((x) => !x)} className="flex items-center gap-2 py-1 text-ink-2">
      {label}
      <span className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-up" : "bg-line-strong"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

const control = "h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-line-strong md:h-9";

export function ScreenerTable({ rows, news, asOf }: { rows: ScreenRow[]; news: Record<string, NewsBundle>; asOf: string }) {
  // Latest NSE prices for every stock, once they are from the screen's session or later.
  const liveFile = freshFor(useLiveFile(), asOf);
  const live = useMemo<Record<string, Px>>(
    () => (liveFile ? Object.fromEntries(Object.entries(liveFile.q).map(([k, [last, pChange]]) => [k, { last, pChange }])) : {}),
    [liveFile],
  );
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) {
      if (!phaseOk(r, phase)) continue;
      for (const t of r.tags) c[t] = (c[t] ?? 0) + 1;
    }
    return c;
  }, [rows, phase]);
  const [tab, setTab] = useState<TabKey>("leader");
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [positive, setPositive] = useState(false);
  const [starred, setStarred] = useState(false);
  // The open tab lives in the URL (?tab=setup) so a view can be shared or bookmarked.
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && SCREENS.some((x) => x.key === t)) setTab(t as TabKey);
    const p = new URLSearchParams(window.location.search).get("phase");
    if (p && PHASES.some((x) => x.key === p)) setPhase(p as PhaseFilter);
  }, []);
  const choosePhase = (p: PhaseFilter) => {
    setPhase(p);
    const url = new URL(window.location.href);
    if (p === "all") url.searchParams.delete("phase");
    else url.searchParams.set("phase", p);
    window.history.replaceState(null, "", url);
  };
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
          // A search looks through every screened stock, not just the open list.
          (!!needle || r.tags.includes(tab)) &&
          phaseOk(r, phase) &&
          (!sector || r.industry === sector) &&
          (!positive || news[r.symbol]?.ai?.sentiment === "positive") &&
          (!starred || isStar(r, news[r.symbol])) &&
          (!needle || r.symbol.includes(needle) || r.name.toUpperCase().includes(needle)),
      )
      .sort(fn);
  }, [rows, tab, q, sector, sort, positive, starred, news, phase]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
        <div role="radiogroup" aria-label="Uptrend phase" className="flex self-start rounded-lg bg-surface-2 p-0.5">
          {PHASES.map((p) => (
            <button
              key={p.key}
              role="radio"
              aria-checked={phase === p.key}
              onClick={() => choosePhase(p.key)}
              className={`rounded-md px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${phase === p.key ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs leading-relaxed text-ink-3">{PHASES.find((p) => p.key === phase)?.hint}</p>
      </div>
      <div role="radiogroup" aria-label="Screens" className="grid grid-cols-3 gap-2">
        {SCREENS.map((t) => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              role="radio"
              aria-checked={on}
              onClick={() => choose(t.key)}
              className={`flex flex-col rounded-xl border p-2.5 text-left transition-colors sm:p-3 ${on ? "border-ink bg-surface" : "border-line hover:border-line-strong"}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-medium ${on ? "text-ink" : "text-ink-2"}`}>
                  <span className="sm:hidden">{t.mobile}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                </span>
                <span className="num text-xs text-ink-3">{counts[t.key] ?? 0}</span>
              </span>
              <span className="mt-1 hidden text-xs leading-snug text-ink-3 sm:block">{t.short}</span>
            </button>
          );
        })}
      </div>

      <p className="text-sm leading-relaxed text-ink-2">{SCREENS.find((t) => t.key === tab)?.blurb}</p>

      <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
        <label className={`${control} col-span-2 flex items-center gap-2 md:w-72`}>
          <Search className="h-4 w-4 shrink-0 text-ink-3" aria-hidden="true" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search any screened stock" aria-label="Search" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3" />
        </label>
        <Select label="Sector" value={sector} onChange={setSector} options={[{ value: "", label: "All" }, ...sectors.map((x) => ({ value: x, label: x }))]} className="min-w-0 md:w-60" />
        <Select label="Sort" value={sort} onChange={(v) => setSort(v as SortKey)} options={SORTS.map((x) => ({ value: x.key, label: x.label }))} className="min-w-0 md:w-56" />
      </div>

      <Glossary />

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 text-xs text-ink-3 md:px-5">
          <span>
            <span className="num text-ink-2">{shown.length}</span> {shown.length === 1 ? "stock" : "stocks"}
            {liveFile && (
              <span
                className="ml-2 inline-flex items-center gap-1.5"
                title="Prices and today's change are live from NSE. Lists, stages and checks update after today's close."
              >
                <span className={`h-1.5 w-1.5 rounded-full bg-up ${liveFile.marketOpen ? "animate-pulse" : ""}`} aria-hidden="true" />
                {liveFile.marketOpen ? `prices ${liveLabel(liveFile).toLowerCase()}` : `prices as of ${liveLabel(liveFile).replace("NSE ", "")}`}
              </span>
            )}
          </span>
          <div className="flex items-center gap-4">
            <Toggle on={starred} set={setStarred} label="Starred only" />
            <Toggle on={positive} set={setPositive} label="Positive news" />
          </div>
        </div>
        {shown.length ? (
          <>
            <ul className="divide-y divide-line md:hidden">
              {shown.map((r) => (
                <MobileItem key={r.isin} r={r} n={news[r.symbol]} q={live[r.symbol]} />
              ))}
            </ul>
            <div className="hidden md:block">
              <DesktopTable rows={shown} news={news} live={live} />
            </div>
          </>
        ) : (
          <p className="px-4 py-12 text-center text-sm leading-relaxed text-ink-3">
            {q.trim() ? "No screened stock matches. The screener only covers stocks in or near an uptrend; open any stock at /stock/SYMBOL." : "Nothing matches today. Lists like this are often empty when the market is weak."}
          </p>
        )}
      </div>
    </div>
  );
}
