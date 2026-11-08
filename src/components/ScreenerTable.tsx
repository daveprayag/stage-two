"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { NewsBundle, ScreenRow, ScreenTag } from "@/engine/types";
import { pct, price } from "@/lib/format";
import { RsBar, SentimentDot, StagePill, TagBadge } from "./Badges";

type TabKey = ScreenTag | "all";

const TABS: { key: TabKey; label: string; blurb: string }[] = [
  { key: "breakout", label: "Breakouts", blurb: "Closed above the top of a base (at least 8 weeks) on 1.5× average volume, while in a stage 2 uptrend." },
  { key: "setup", label: "Setting up", blurb: "7–8 of the 8 trend-template rules, within 15% of the 52-week high, a tight 10-day range and volume drying up: the quiet before a possible breakout." },
  { key: "fresh2", label: "Fresh stage 2", blurb: "Moved into a stage 2 uptrend (price above a rising 30-week average) within the last 30 sessions, with RS ≥ 70: early leaders." },
  { key: "leader", label: "Leaders", blurb: "Relative strength in the top 10% of the market with the trend template intact." },
  { key: "ankur", label: "Ankur's scans", blurb: "Ankur Patel's Chartink scans fired today (volume expansion, 20 EMA pullback, flag), or a setup from the Livermore rule engine." },
  { key: "all", label: "All", blurb: "Every stock that passed at least one screen, ranked by score." },
];

export function ScreenerTable({ rows, news }: { rows: ScreenRow[]; news: Record<string, NewsBundle> }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length };
    for (const r of rows) for (const t of r.tags) c[t] = (c[t] ?? 0) + 1;
    return c;
  }, [rows]);
  const [tab, setTab] = useState<TabKey>(() => (counts.breakout ? "breakout" : "setup"));
  const [q, setQ] = useState("");
  const [sector, setSector] = useState("");
  const [newsOnly, setNewsOnly] = useState(false);
  const sectors = useMemo(() => [...new Set(rows.map((r) => r.industry).filter((x): x is string => !!x))].sort(), [rows]);

  const shown = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return rows.filter(
      (r) =>
        (tab === "all" || r.tags.includes(tab)) &&
        (!sector || r.industry === sector) &&
        (!newsOnly || news[r.symbol]?.ai?.sentiment === "positive") &&
        (!needle || r.symbol.includes(needle) || r.name.toUpperCase().includes(needle)),
    );
  }, [rows, tab, q, sector, newsOnly, news]);
  const blurb = TABS.find((t) => t.key === tab)?.blurb;

  return (
    <section className="rounded-xl border border-line bg-surface">
      <div className="scroll-x border-b border-line">
        <div role="tablist" className="flex min-w-max gap-1 px-2 pt-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px flex items-center gap-2 rounded-t-md border-b-2 px-3 py-2 text-sm whitespace-nowrap ${tab === t.key ? "border-ink font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
            >
              {t.label}
              <span className="num rounded bg-surface-2 px-1.5 text-[11px] text-ink-2">{counts[t.key] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3 border-b border-line p-3 sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-ink-2">{blurb}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-8 items-center gap-1.5 rounded-md border border-line bg-bg px-2 text-sm focus-within:border-line-strong">
            <Search className="h-3.5 w-3.5 text-ink-3" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Symbol or name" className="w-32 bg-transparent outline-none placeholder:text-ink-3" />
          </label>
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="h-8 max-w-[12rem] rounded-md border border-line bg-bg px-2 text-sm text-ink">
            <option value="">All sectors</option>
            {sectors.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <label className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-bg px-2 text-sm text-ink-2">
            <input type="checkbox" checked={newsOnly} onChange={(e) => setNewsOnly(e.target.checked)} className="accent-[var(--up)]" />
            Positive news
          </label>
        </div>
      </div>

      <div className="scroll-x">
        <table className="w-full min-w-[980px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="sticky left-0 bg-surface px-3 py-2 font-normal">Stock</th>
              <th className="px-3 py-2 text-right font-normal">Close</th>
              <th className="px-3 py-2 font-normal" title="Relative strength rating, 1–99">RS</th>
              <th className="px-3 py-2 font-normal">Stage</th>
              <th className="px-3 py-2 text-right font-normal" title="Distance below the 52-week high">From high</th>
              <th className="px-3 py-2 text-right font-normal" title="10-day high–low range as % of price">10d range</th>
              <th className="px-3 py-2 text-right font-normal" title="5-day vs 50-day average volume; below 1 = drying up">Vol 5/50</th>
              <th className="px-3 py-2 font-normal">Signals</th>
              <th className="px-3 py-2 font-normal">News</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const n = news[r.symbol];
              return (
                <tr key={r.isin} className="group border-b border-line/70 last:border-0 hover:bg-surface-2/60">
                  <td className="sticky left-0 bg-surface px-3 py-2.5 group-hover:bg-surface-2">
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="block">
                      <span className="font-medium text-ink">{r.symbol}</span>
                      <span className="block max-w-[14rem] truncate text-xs text-ink-3">{r.industry ?? r.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="num block">{price(r.close)}</span>
                    <span className={`num text-xs ${r.chgPct >= 0 ? "text-up" : "text-down"}`}>{pct(r.chgPct)}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <RsBar rs={r.rs} />
                  </td>
                  <td className="px-3 py-2.5">
                    <StagePill stage={r.stage} age={r.stageAge} />
                  </td>
                  <td className="num px-3 py-2.5 text-right">{pct(-r.pctFromHigh)}</td>
                  <td className={`num px-3 py-2.5 text-right ${r.tight10 <= 8 ? "text-up" : ""}`}>{r.tight10.toFixed(1)}%</td>
                  <td className={`num px-3 py-2.5 text-right ${r.dryUp <= 0.8 ? "text-up" : ""}`}>{r.dryUp.toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {r.tags.filter((t) => t !== "ankur").map((t) => (
                        <TagBadge key={t} tag={t} />
                      ))}
                      {r.setup && <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">{r.setup}</span>}
                      {r.scans.map((s) => (
                        <span key={s} className="rounded border border-line px-1.5 py-0.5 text-[11px] text-ink-2">{s}</span>
                      ))}
                    </div>
                  </td>
                  <td className="max-w-[20rem] px-3 py-2.5">
                    {n?.ai ? (
                      <span className="flex items-start gap-2" title={n.ai.summary}>
                        <SentimentDot s={n.ai.sentiment} />
                        <span className="line-clamp-2 text-xs text-ink-2">{n.ai.summary}</span>
                      </span>
                    ) : (
                      <span className="text-xs text-ink-3">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!shown.length && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-ink-3">
                  Nothing matches today. Screens like this are often empty when the market is weak.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
