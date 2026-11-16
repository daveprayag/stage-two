"use client";
/**
 * Shared pieces of the holdings charts: a width hook, the tooltip, tick maths and number formats. The charts follow
 * one set of specs: hairline solid grid, 2px lines, end dots with a 2px surface ring, bars at most 24px thick with a
 * 4px rounded data end, and a 2px surface gap between touching fills. Colours come from the site's tokens, and every
 * coloured mark also carries a sign, a label or a legend (the site's green and red are close for colour-blind eyes).
 */
import { useEffect, useRef, useState } from "react";
import { int } from "@/lib/format";

export function useWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth);
    const ro = new ResizeObserver((es) => {
      const e = es[0];
      if (e) setW(Math.round(e.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** A tooltip inside a `relative` box, kept within its width; above the point when there is room. */
export function Tip({ x, y, box, width = 208, children }: { x: number; y: number; box: number; width?: number; children: React.ReactNode }) {
  const left = Math.max(0, Math.min(box - width, x + 14 > box - width ? x - width - 14 : x + 14));
  return (
    <div
      role="tooltip"
      style={{ left, top: Math.max(0, y), width }}
      className="pointer-events-none absolute z-20 rounded-xl border border-line bg-surface/95 p-2.5 text-xs shadow-lg backdrop-blur-sm"
    >
      {children}
    </div>
  );
}

/** One tooltip row: value first (strong), label after, keyed by a short stroke of the series colour. */
export function TipRow({ color, value, label }: { color?: string; value: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {color && <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />}
      <span className="font-medium text-ink">{value}</span>
      <span className="min-w-0 truncate text-ink-3">{label}</span>
    </div>
  );
}

/** About `n` round ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, n = 4): number[] {
  if (!(hi > lo)) return [lo];
  const raw = (hi - lo) / n;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) ?? 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export const signedPct = (x: number | null | undefined, digits = 1) =>
  x === null || x === undefined || !Number.isFinite(x) ? "—" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toFixed(digits)}%`;

/** ₹ in Indian style, compact past a lakh: ₹8,724 · ₹1.76 L · ₹2.1 Cr. */
export function inr(x: number | null | undefined, signed = false): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  const a = Math.abs(x);
  const s = signed ? (x > 0 ? "+" : x < 0 ? "−" : "") : x < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹${(a / 1e5).toFixed(2)} L`;
  return `${s}₹${int(Math.round(a))}`;
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-12" → "12 Nov"; with `year` → "Nov '26". */
export const dateLabel = (d: string, year = false) =>
  year ? `${MON[Number(d.slice(5, 7)) - 1]} '${d.slice(2, 4)}` : `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;

/** A token mixed into the raised surface: the fill for tiles and cells (`pct` of the colour). */
export const tint = (token: string, pct: number) => `color-mix(in oklab, var(${token}) ${pct}%, var(--surface-2))`;

/** Chart card: title, an optional control on the right, the chart, and a footnote. */
export function ChartCard({
  title,
  sub,
  control,
  children,
  foot,
  className = "",
}: {
  title: string;
  sub?: React.ReactNode;
  control?: React.ReactNode;
  children: React.ReactNode;
  foot?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-w-0 flex-col rounded-2xl border border-line bg-surface ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-ink">{title}</h2>
          {sub && <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{sub}</p>}
        </div>
        {control}
      </div>
      <div className="min-w-0 flex-1 px-4 pt-3 pb-4 sm:px-5">{children}</div>
      {foot && <p className="border-t border-line px-4 py-2.5 text-[11px] leading-relaxed text-ink-3 sm:px-5">{foot}</p>}
    </section>
  );
}

/** Segmented control (ranges, colour modes). */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg bg-surface-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 text-xs transition-colors ${o.value === value ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
