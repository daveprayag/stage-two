"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import type { NewsBundle, ScreenRow, ScreenTag } from "@/engine/types";
import { price, titleCase } from "@/lib/format";
import { baseShort, Change, FirstLine, PhaseLabel, phaseDetail, phaseNote, RsMeter, SentimentDot, StageLabel } from "./Badges";
import { Select } from "./Select";
import { isTopSetup } from "@/engine/topsetup";

type TabKey = Exclude<ScreenTag, "qualified"> | "all" | "top";
type SortKey = "score" | "rs" | "high" | "tight" | "move";

export const SCREENS: { key: TabKey; label: string; short: string; blurb: string }[] = [
  {
    key: "top",
    label: "Top setups",
    short: "Pass every check, news included",
    blurb:
      "Every check at once: a live uptrend (not a dying one), all moving averages stacked, above the 20- and 50-day EMAs, RSI 50–75, RS 80+, near the high but not stretched, buyers in control on volume, breaking out or tight near the high, liquid, and positive news with no red flags. The strongest shortlist the data gives, not a guarantee: always use a stop.",
  },
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
    blurb: "Three of Ankur Patel's Chartink scans merged into one list (volume expansion, 20 EMA pullback, flag), plus his setups from the Livermore rule engine. He runs each scan separately: pick one under Scan to compare with his Chartink list.",
  },
  { key: "all", label: "All", short: "Everything above, ranked", blurb: "Every stock on at least one list." },
];

/** The scans that put a stock in the "Ankur's scans" list (his broad momentum list is a watchlist, shown as a label only). */
const ANKUR_SCANS = ["Volume (range expansion)", "20 EMA pullback", "Flag"];

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
  ["RSI", "Relative Strength Index (14 days), 0–100: momentum of recent price moves. Top setups need 50–75: rising, but not overbought (above ~75 a pullback is more likely)."],
  ["Stage", "Where the stock is in its cycle, from its 150-day average: 1 sideways base, 2 uptrend, 3 topping, 4 downtrend."],
  ["Phase", "How far into its uptrend a stage 2 stock is, counted from when it left its latest base (8+ weeks sideways within a 35% range). A rally is a rise of 20%+ without a 10% pullback. Early = still in the base, just out of it, or in the first rally (Ankur's best buy: the first pause after the base); mid = second rally; late = third or later, any 80%+ rally, or no sideways base in the last 14 months. \u201cAbove base\u201d = how far the price is above the top of that base."],
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
  const [phase, setPhase] = useState<PhaseFilter>("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, top: 0 };
    for (const r of rows) {
      if (!phaseOk(r, phase)) continue;
      c.all = (c.all ?? 0) + 1;
      for (const t of r.tags) c[t] = (c[t] ?? 0) + 1;
      if (isTopSetup(r, news[r.symbol])) c.top = (c.top ?? 0) + 1;
    }
    return c;
  }, [rows, news, phase]);
  const [tab, setTab] = useState<TabKey>(() => (counts.top ? "top" : counts.breakout ? "breakout" : "setup"));
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [sort, setSort] = useState<SortKey>("score");
  const [positive, setPositive] = useState(false);
  // Inside "Ankur's scans": view one of his lists at a time, as he runs them on Chartink.
  const [scan, setScan] = useState("");
  const scanOptions = useMemo(() => {
    const n = (f: (r: ScreenRow) => boolean) => rows.filter((r) => r.tags.includes("ankur") && f(r)).length;
    return [
      { value: "", label: `All his scans (${n(() => true)})` },
      ...ANKUR_SCANS.map((x) => ({ value: x, label: `${x} (${n((r) => r.scans.includes(x))})` })),
      { value: "setup", label: `Rule-engine setups (${n((r) => !!r.setup)})` },
    ];
  }, [rows]);
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
          (tab === "all" || (tab === "top" ? isTopSetup(r, news[r.symbol]) : r.tags.includes(tab))) &&
          phaseOk(r, phase) &&
          (!sector || r.industry === sector) &&
          (tab !== "ankur" || !scan || (scan === "setup" ? !!r.setup : r.scans.includes(scan))) &&
          (!positive || news[r.symbol]?.ai?.sentiment === "positive") &&
          (!needle || r.symbol.includes(needle) || r.name.toUpperCase().includes(needle)),
      )
      .sort(fn);
  }, [rows, tab, q, sector, sort, positive, news, scan, phase]);

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
      <div role="radiogroup" aria-label="Screens" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
        {SCREENS.map((t) => {
          const on = tab === t.key;
          const top = t.key === "top";
          return (
            <button
              key={t.key}
              role="radio"
              aria-checked={on}
              onClick={() => choose(t.key)}
              className={`flex flex-col rounded-xl border p-3 text-left transition-colors ${top ? "col-span-2 sm:col-span-3 xl:col-span-1" : ""} ${
                on ? (top ? "border-up bg-up-soft/60" : "border-ink bg-surface") : top ? "border-up/40 bg-up-soft/30 hover:border-up" : "border-line hover:border-line-strong"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className={`text-sm font-medium ${top ? "text-up" : on ? "text-ink" : "text-ink-2"}`}>{t.label}</span>
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
        {tab === "ankur" && <Select label="Scan" value={scan} onChange={setScan} options={scanOptions} className="col-span-2 min-w-0 md:w-72" />}
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
          <p className="px-4 py-12 text-center text-sm leading-relaxed text-ink-3">
            {tab === "top" ? "No stock passes every check today. That is normal: on most days none or a handful do, and none at all in weak markets." : "Nothing matches today. Lists like this are often empty when the market is weak."}
          </p>
        )}
      </div>
    </div>
  );
}
