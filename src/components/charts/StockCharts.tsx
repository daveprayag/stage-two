"use client";
/**
 * One holding's charts: its price against what you paid (green above your cost, red below), the last quarters'
 * revenue and profit, and a small trend line for the list.
 */
import { useId, useMemo, useState } from "react";
import type { BizView } from "@/engine/business";
import { price as fmtPrice } from "@/lib/format";
import { dateLabel, niceTicks, Segmented, signedPct, Tip, TipRow, useWidth } from "./base";

type Range = "3M" | "6M" | "1Y";
const SESSIONS: Record<Range, number> = { "3M": 63, "6M": 126, "1Y": 250 };

export function PriceCostChart({ dates, closes, avg, stop, now }: { dates: string[]; closes: (number | null)[]; avg: number; stop: number | null; now: number | null }) {
  const [range, setRange] = useState<Range>("6M");
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, "");
  const H = 190;
  const AX = 20;
  const PAD = { l: 2, r: 58, t: 8 };

  const pts = useMemo(() => {
    const start = Math.max(0, dates.length - 1 - SESSIONS[range]);
    const out: { d: string; c: number }[] = [];
    for (let i = start; i < dates.length; i++) {
      const c = closes[i];
      if (c !== null && c !== undefined) out.push({ d: dates[i]!, c });
    }
    if (now !== null && out.length && Math.abs(now - out[out.length - 1]!.c) > 1e-9) out.push({ d: "now", c: now });
    return out;
  }, [dates, closes, range, now]);

  if (pts.length < 2) return <p className="text-xs text-ink-3">Not enough price history yet (listed recently).</p>;
  const vals = [...pts.map((p) => p.c), avg, ...(stop !== null ? [stop] : [])];
  const lo0 = Math.min(...vals);
  const hi0 = Math.max(...vals);
  const padv = (hi0 - lo0) * 0.08 || hi0 * 0.05;
  const lo = lo0 - padv;
  const hi = hi0 + padv;
  const pw = Math.max(1, w - PAD.l - PAD.r);
  const X = (i: number) => PAD.l + (i / (pts.length - 1)) * pw;
  const Y = (v: number) => PAD.t + (1 - (v - lo) / (hi - lo)) * (H - PAD.t);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.c).toFixed(1)}`).join("");
  const yc = Y(avg);
  const area = `${line}L${X(pts.length - 1).toFixed(1)},${yc.toFixed(1)}L${X(0).toFixed(1)},${yc.toFixed(1)}Z`;
  const last = pts[pts.length - 1]!;
  const vsCost = (last.c / avg - 1) * 100;
  const hv = hover !== null && hover < pts.length ? hover : null;
  const ticks = niceTicks(lo, hi, 3).filter((t) => Math.abs(Y(t) - yc) > 12);
  const pick = (clientX: number, rect: DOMRect) => setHover(Math.max(0, Math.min(pts.length - 1, Math.round(((clientX - rect.left - PAD.l) / pw) * (pts.length - 1)))));
  const labelOf = (d: string) => (d === "now" ? "Now" : dateLabel(d, range === "1Y"));
  const xt = [0, Math.round((pts.length - 1) / 2), pts.length - 1];

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">
          <span className={vsCost >= 0 ? "text-up" : "text-down"}>{signedPct(vsCost)}</span> against your average cost of ₹{fmtPrice(avg)}
        </p>
        <Segmented label="Range" value={range} onChange={(v) => { setRange(v); setHover(null); }} options={(["3M", "6M", "1Y"] as Range[]).map((r) => ({ value: r, label: r }))} />
      </div>
      <div ref={ref} className="relative" style={{ height: H + AX }}>
        {w > 0 && (
          <svg
            width={w}
            height={H + AX}
            role="img"
            tabIndex={0}
            aria-label={`Price ${signedPct(vsCost)} against your average cost`}
            className="block touch-pan-y outline-none focus-visible:rounded-lg focus-visible:ring-2 focus-visible:ring-line-strong"
            onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
            onPointerLeave={() => setHover(null)}
            onBlur={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
                e.preventDefault();
                setHover((h) => Math.max(0, Math.min(pts.length - 1, (h ?? pts.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
              }
            }}
          >
            <defs>
              <clipPath id={`above-${uid}`}>
                <rect x={0} y={0} width={w} height={Math.max(0, yc)} />
              </clipPath>
              <clipPath id={`below-${uid}`}>
                <rect x={0} y={yc} width={w} height={Math.max(0, H - yc)} />
              </clipPath>
            </defs>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={w - PAD.r + 4} y1={Y(t)} y2={Y(t)} stroke="var(--chart-grid)" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={w - PAD.r + 8} y={Y(t)} dy="0.32em" className="num fill-ink-3 text-[10px]">
                  {t >= 1000 ? Math.round(t).toLocaleString("en-IN") : t.toFixed(t < 100 ? 1 : 0)}
                </text>
              </g>
            ))}
            <path d={area} fill="var(--up)" opacity={0.13} clipPath={`url(#above-${uid})`} />
            <path d={area} fill="var(--down)" opacity={0.13} clipPath={`url(#below-${uid})`} />
            <line x1={PAD.l} x2={w - PAD.r + 4} y1={yc} y2={yc} stroke="var(--ink-3)" strokeWidth={1} shapeRendering="crispEdges" />
            <text x={w - PAD.r + 8} y={yc} dy="0.32em" className="fill-ink-2 text-[10px] font-medium">
              Your cost
            </text>
            {stop !== null && (
              <>
                <line x1={PAD.l} x2={w - PAD.r + 4} y1={Y(stop)} y2={Y(stop)} stroke="var(--amber)" strokeWidth={1} shapeRendering="crispEdges" />
                <text x={w - PAD.r + 8} y={Y(stop)} dy="0.32em" className="fill-ink-2 text-[10px]">
                  Stop
                </text>
              </>
            )}
            <path d={line} fill="none" stroke="var(--up)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#above-${uid})`} />
            <path d={line} fill="none" stroke="var(--down)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" clipPath={`url(#below-${uid})`} />
            <circle cx={X(pts.length - 1)} cy={Y(last.c)} r={4} fill={last.c >= avg ? "var(--up)" : "var(--down)"} stroke="var(--surface)" strokeWidth={2} />
            {xt.map((i, j) => (
              <text key={j} x={X(i)} y={H + 14} textAnchor={j === 0 ? "start" : j === 2 ? "end" : "middle"} className="fill-ink-3 text-[10px]">
                {labelOf(pts[i]!.d)}
              </text>
            ))}
            {hv !== null && (
              <g pointerEvents="none">
                <line x1={X(hv)} x2={X(hv)} y1={PAD.t} y2={H} stroke="var(--line-strong)" strokeWidth={1} shapeRendering="crispEdges" />
                <circle cx={X(hv)} cy={Y(pts[hv]!.c)} r={4} fill={pts[hv]!.c >= avg ? "var(--up)" : "var(--down)"} stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
        )}
        {hv !== null && (
          <Tip x={X(hv)} y={4} box={w} width={176}>
            <div className="mb-1 text-[11px] text-ink-3">{pts[hv]!.d === "now" ? "Now" : `${dateLabel(pts[hv]!.d)} ${pts[hv]!.d.slice(0, 4)}`}</div>
            <TipRow value={`₹${fmtPrice(pts[hv]!.c)}`} label="close" />
            <TipRow value={signedPct((pts[hv]!.c / avg - 1) * 100)} label="vs your cost" />
          </Tip>
        )}
      </div>
    </div>
  );
}

/** Revenue and profit by quarter, as two small column charts on their own axes (never one chart with two scales). */
export function QuarterBars({ b }: { b: BizView }) {
  const rev = b.revenueKind === "interest" ? "Interest earned" : b.revenueKind === "income" ? "Total income" : "Revenue";
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Columns title={`${rev}, ₹ Cr`} qs={b.quarters.map((q) => ({ label: q.label, v: q.revenueCr, yoy: q.revenueYoY }))} />
      <Columns title="Net profit, ₹ Cr" qs={b.quarters.map((q) => ({ label: q.label, v: q.profitCr, yoy: q.profitYoY }))} />
    </div>
  );
}

const crShort = (x: number) => {
  const a = Math.abs(x);
  const s = x < 0 ? "−" : "";
  return a >= 1000 ? `${s}${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k` : `${s}${a >= 100 ? Math.round(a) : a.toFixed(1)}`;
};

function Columns({ title, qs }: { title: string; qs: { label: string; v: number | null; yoy: number | null }[] }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 104;
  const TOP = 14;
  const vals = qs.map((q) => q.v ?? 0);
  const hi = Math.max(0, ...vals);
  const lo = Math.min(0, ...vals);
  const Y = (v: number) => TOP + (1 - (v - lo) / (hi - lo || 1)) * (H - TOP);
  const n = qs.length;
  const slot = w / Math.max(1, n);
  const bw = Math.min(24, slot * 0.62);
  const last = n - 1;
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] text-ink-3">{title}</div>
      <div ref={ref} className="relative" style={{ height: H + 18 }} onPointerLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={H + 18} role="img" aria-label={`${title}: ${qs.map((q) => `${q.label} ${q.v === null ? "no figure" : crShort(q.v)}`).join(", ")}`} className="block">
            <line x1={0} x2={w} y1={Y(0)} y2={Y(0)} stroke="var(--line-strong)" strokeWidth={1} shapeRendering="crispEdges" />
            {qs.map((q, i) => {
              if (q.v === null) return null;
              const x = i * slot + (slot - bw) / 2;
              const y = Math.min(Y(q.v), Y(0));
              const h = Math.max(1, Math.abs(Y(q.v) - Y(0)));
              const r = Math.min(4, h, bw / 2);
              const up = q.v >= 0;
              const d = up
                ? `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`
                : `M${x},${y}V${y + h - r}Q${x},${y + h} ${x + r},${y + h}H${x + bw - r}Q${x + bw},${y + h} ${x + bw},${y + h - r}V${y}Z`;
              const fill = !up ? "var(--down)" : i === last ? "var(--blue)" : "var(--ink-3)";
              return <path key={q.label} d={d} fill={fill} opacity={hover === null || hover === i ? (i === last || !up ? 1 : 0.55) : 0.3} />;
            })}
            {qs[last]?.v !== null && qs[last]?.v !== undefined && (
              <text x={last * slot + slot / 2} y={Math.min(Y(qs[last]!.v as number), Y(0)) - 4} textAnchor="middle" className="num fill-ink text-[10px]">
                {crShort(qs[last]!.v as number)}
              </text>
            )}
            {qs.map((q, i) =>
              i % (n > 6 && w < 300 ? 2 : 1) === (n - 1) % (n > 6 && w < 300 ? 2 : 1) ? (
                <text key={q.label} x={i * slot + slot / 2} y={H + 13} textAnchor="middle" className="fill-ink-3 text-[9px]">
                  {q.label}
                </text>
              ) : null,
            )}
            {qs.map((q, i) => (
              <rect key={`hit-${q.label}`} x={i * slot} y={0} width={slot} height={H} fill="transparent" onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
            ))}
          </svg>
        )}
        {hover !== null && qs[hover] && (
          <Tip x={hover * slot + slot / 2} y={0} box={w} width={150}>
            <div className="mb-1 text-[11px] text-ink-3">{qs[hover]!.label}</div>
            <TipRow value={qs[hover]!.v === null ? "—" : `₹${crShort(qs[hover]!.v as number)} Cr`} label="" />
            <TipRow value={signedPct(qs[hover]!.yoy, 0)} label="vs a year earlier" />
          </Tip>
        )}
      </div>
    </div>
  );
}

/** A small trend line: the last `n` closes, green if up over them, red if down. */
export function Sparkline({ closes, n = 63, width = 72, height = 24 }: { closes: (number | null)[] | undefined; n?: number; width?: number; height?: number }) {
  const xs = (closes ?? []).slice(-n).filter((x): x is number => x !== null);
  if (xs.length < 5) return <span className="inline-block text-[10px] text-ink-3" style={{ width }}>—</span>;
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const X = (i: number) => 1 + (i / (xs.length - 1)) * (width - 6);
  const Y = (v: number) => 3 + (1 - (v - lo) / (hi - lo || 1)) * (height - 6);
  const up = xs[xs.length - 1]! >= xs[0]!;
  const d = xs.map((v, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} aria-hidden="true" className="block shrink-0">
      <path d={d} fill="none" stroke={up ? "var(--up)" : "var(--down)"} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={X(xs.length - 1)} cy={Y(xs[xs.length - 1]!)} r={2} fill={up ? "var(--up)" : "var(--down)"} />
    </svg>
  );
}

/** % change over the last `n` closes. */
export function changeOver(closes: (number | null)[] | undefined, n = 63): number | null {
  const xs = (closes ?? []).slice(-n).filter((x): x is number => x !== null);
  return xs.length >= 5 ? (xs[xs.length - 1]! / xs[0]! - 1) * 100 : null;
}
