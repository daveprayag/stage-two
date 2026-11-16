"use client";
/**
 * Today's holdings against NIFTY 500 over a chosen range, as % change from the range's start (portfolio.ts). Two
 * series on one axis: the holdings in the accent, the index in grey. Crosshair and tooltip on hover, arrow keys when
 * focused.
 */
import { useMemo, useState } from "react";
import { basketGrowth, growth, type HoldingsHistory } from "@/engine/portfolio";
import { dateLabel, niceTicks, Segmented, signedPct, Tip, TipRow, useWidth } from "./base";

type Range = "1M" | "3M" | "6M" | "1Y";
const SESSIONS: Record<Range, number> = { "1M": 21, "3M": 63, "6M": 126, "1Y": 250 };
const H = 240;
const AXIS = 24;
const PAD = { l: 4, r: 48, t: 10 };

export interface PerfInput {
  history: HoldingsHistory;
  qty: Record<string, number>;
  /** Live prices now, if newer than the last close: by symbol, and NIFTY 500. */
  live: { closes: Record<string, number | null>; nifty: number | null } | null;
}

export function PerformanceChart({ history, qty, live }: PerfInput) {
  const [range, setRange] = useState<Range>("6M");
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const d = useMemo(() => {
    const n = history.dates.length;
    const start = Math.max(0, n - 1 - SESSIONS[range]);
    const you = basketGrowth(history, qty, start, live?.closes).map((g) => (g - 1) * 100);
    const idx = growth(history.nifty500, start, live ? live.nifty : undefined).map((g) => (g === null ? null : (g - 1) * 100));
    const dates = [...history.dates.slice(start), ...(live ? ["now"] : [])];
    return { you, idx, dates };
  }, [history, qty, live, range]);

  const all = [...d.you, ...d.idx.filter((x): x is number => x !== null)];
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const ticks = niceTicks(lo, hi, 4);
  const y0 = Math.min(lo, ticks[0] ?? lo);
  const y1 = Math.max(hi, ticks[ticks.length - 1] ?? hi);
  const pw = Math.max(1, w - PAD.l - PAD.r);
  const X = (i: number) => PAD.l + (d.dates.length > 1 ? (i / (d.dates.length - 1)) * pw : 0);
  const Y = (v: number) => PAD.t + (1 - (v - y0) / (y1 - y0 || 1)) * (H - PAD.t);
  const path = (xs: (number | null)[]) => {
    let s = "";
    let pen = false;
    xs.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      s += `${pen ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`;
      pen = true;
    });
    return s;
  };
  const last = d.you.length - 1;
  const youEnd = d.you[last] ?? 0;
  const idxEnd = d.idx[last] ?? null;
  const gap = idxEnd === null ? null : youEnd - idxEnd;
  const area = `${path(d.you)}L${X(last).toFixed(1)},${Y(0).toFixed(1)}L${X(0).toFixed(1)},${Y(0).toFixed(1)}Z`;
  const xTicks = (() => {
    const n = d.dates.length;
    const k = w < 480 ? 3 : 5;
    return Array.from({ length: k }, (_, j) => Math.round((j * (n - 1)) / (k - 1)));
  })();
  const label = (i: number) => {
    const dt = d.dates[i] ?? "";
    return dt === "now" ? "Now" : dateLabel(dt, range === "1Y");
  };

  const pick = (clientX: number, rect: DOMRect) => {
    const i = Math.round(((clientX - rect.left - PAD.l) / pw) * (d.dates.length - 1));
    setHover(Math.max(0, Math.min(d.dates.length - 1, i)));
  };
  const hv = hover !== null && hover < d.dates.length ? hover : null;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-blue" aria-hidden="true" />
            <span className="text-ink-2">Your holdings</span>
            <span className={`num ${youEnd >= 0 ? "text-up" : "text-down"}`}>{signedPct(youEnd)}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 rounded-full bg-ink-3" aria-hidden="true" />
            <span className="text-ink-2">NIFTY 500</span>
            <span className={`num ${(idxEnd ?? 0) >= 0 ? "text-up" : "text-down"}`}>{signedPct(idxEnd)}</span>
          </span>
          {gap !== null && (
            <span className="text-ink-3">
              {gap >= 0 ? "Ahead" : "Behind"} by <span className="num text-ink-2">{Math.abs(gap).toFixed(1)}</span> pts
            </span>
          )}
        </div>
        <Segmented label="Range" value={range} onChange={(v) => { setRange(v); setHover(null); }} options={(["1M", "3M", "6M", "1Y"] as Range[]).map((r) => ({ value: r, label: r }))} />
      </div>
      <div ref={ref} className="relative min-w-0" style={{ height: H + AXIS }}>
        {w > 0 && (
          <svg
            width={w}
            height={H + AXIS}
            role="img"
            tabIndex={0}
            aria-label={`Your holdings ${signedPct(youEnd)} against NIFTY 500 ${signedPct(idxEnd)} over ${range}`}
            className="block touch-pan-y outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-line-strong"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                setHover((h) => Math.max(0, Math.min(d.dates.length - 1, (h ?? d.dates.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
              } else if (e.key === "Escape") setHover(null);
            }}
          >
            <defs>
              <linearGradient id="perf-wash" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--blue)" stopOpacity={youEnd >= 0 ? 0.16 : 0} />
                <stop offset="100%" stopColor="var(--blue)" stopOpacity={youEnd >= 0 ? 0 : 0.16} />
              </linearGradient>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={w - PAD.r + 6} y1={Y(t)} y2={Y(t)} stroke={t === 0 ? "var(--line-strong)" : "var(--chart-grid)"} strokeWidth={1} shapeRendering="crispEdges" />
                <text x={w - PAD.r + 10} y={Y(t)} dy="0.32em" className="num fill-ink-3 text-[10px]">
                  {signedPct(t, Math.abs(t) < 10 && t % 1 !== 0 ? 1 : 0)}
                </text>
              </g>
            ))}
            <path d={area} fill="url(#perf-wash)" />
            <path d={path(d.idx)} fill="none" stroke="var(--ink-3)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" opacity={0.75} />
            <path d={path(d.you)} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {idxEnd !== null && <circle cx={X(last)} cy={Y(idxEnd)} r={4} fill="var(--ink-3)" stroke="var(--surface)" strokeWidth={2} />}
            <circle cx={X(last)} cy={Y(youEnd)} r={4} fill="var(--blue)" stroke="var(--surface)" strokeWidth={2} />
            {xTicks.map((i) => (
              <text key={i} x={X(i)} y={H + 16} textAnchor={i === 0 ? "start" : i === d.dates.length - 1 ? "end" : "middle"} className="fill-ink-3 text-[10px]">
                {label(i)}
              </text>
            ))}
            {hv !== null && (
              <g pointerEvents="none">
                <line x1={X(hv)} x2={X(hv)} y1={PAD.t} y2={H} stroke="var(--line-strong)" strokeWidth={1} shapeRendering="crispEdges" />
                {d.idx[hv] !== null && d.idx[hv] !== undefined && <circle cx={X(hv)} cy={Y(d.idx[hv] as number)} r={4} fill="var(--ink-3)" stroke="var(--surface)" strokeWidth={2} />}
                <circle cx={X(hv)} cy={Y(d.you[hv] ?? 0)} r={4} fill="var(--blue)" stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hv !== null && (
          <Tip x={X(hv)} y={8} box={w}>
            <div className="mb-1 text-[11px] text-ink-3">{d.dates[hv] === "now" ? "Now (live prices)" : dateLabel(d.dates[hv] ?? "") + " " + (d.dates[hv] ?? "").slice(0, 4)}</div>
            <TipRow color="var(--blue)" value={signedPct(d.you[hv])} label="Your holdings" />
            <TipRow color="var(--ink-3)" value={signedPct(d.idx[hv])} label="NIFTY 500" />
            {d.idx[hv] !== null && d.idx[hv] !== undefined && (
              <div className="mt-1 border-t border-line pt-1 text-ink-3">
                {(d.you[hv] ?? 0) - (d.idx[hv] as number) >= 0 ? "Ahead" : "Behind"} by {Math.abs((d.you[hv] ?? 0) - (d.idx[hv] as number)).toFixed(1)} pts
              </div>
            )}
          </Tip>
        )}
      </div>
    </div>
  );
}
