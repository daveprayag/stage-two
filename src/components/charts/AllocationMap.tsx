"use client";
/**
 * Where the money is: a treemap of the holdings, grouped by sector, each tile sized by its current value and coloured
 * by the chosen reading (gain, today's move, price trend or business). Tap a tile to open that holding in the list.
 */
import { useMemo, useState } from "react";
import type { HoldingRow } from "@/engine/holdings";
import { displayName } from "../names";
import { inr, Segmented, signedPct, tint, Tip, useWidth } from "./base";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarified treemap (Bruls, Huizing & van Wijk): rows of tiles kept as close to square as the values allow. */
export function squarify<T>(items: { v: number; d: T }[], r: Rect): { r: Rect; d: T }[] {
  const out: { r: Rect; d: T }[] = [];
  const rest = items.filter((i) => i.v > 0).sort((a, b) => b.v - a.v);
  const total = rest.reduce((a, i) => a + i.v, 0);
  if (!total || r.w <= 0 || r.h <= 0) return out;
  const k = (r.w * r.h) / total;
  let box = { ...r };
  let row: { a: number; d: T }[] = [];
  const worst = (xs: { a: number }[], side: number) => {
    const s = xs.reduce((t, x) => t + x.a, 0);
    const mx = Math.max(...xs.map((x) => x.a));
    const mn = Math.min(...xs.map((x) => x.a));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const lay = () => {
    const s = row.reduce((t, x) => t + x.a, 0);
    if (box.w >= box.h) {
      const cw = s / box.h;
      let y = box.y;
      for (const x of row) {
        const h = x.a / cw;
        out.push({ r: { x: box.x, y, w: cw, h }, d: x.d });
        y += h;
      }
      box = { x: box.x + cw, y: box.y, w: box.w - cw, h: box.h };
    } else {
      const rh = s / box.w;
      let x0 = box.x;
      for (const x of row) {
        const w = x.a / rh;
        out.push({ r: { x: x0, y: box.y, w, h: rh }, d: x.d });
        x0 += w;
      }
      box = { x: box.x, y: box.y + rh, w: box.w, h: box.h - rh };
    }
    row = [];
  };
  for (const it of rest) {
    const next = { a: it.v * k, d: it.d };
    const side = Math.min(box.w, box.h);
    if (!row.length || worst([...row, next], side) <= worst(row, side)) row.push(next);
    else {
      lay();
      row.push(next);
    }
  }
  if (row.length) lay();
  return out;
}

export type ColourBy = "gain" | "today" | "trend" | "business";

/** Diverging fill for a % move: four steps each way, neutral near zero. */
function moveFill(x: number | null, steps: [number, number, number]): string {
  if (x === null || !Number.isFinite(x)) return "var(--surface-2)";
  const a = Math.abs(x);
  if (a < steps[0] / 3) return tint("--ink-3", 14);
  const pct = a >= steps[2] ? 60 : a >= steps[1] ? 46 : a >= steps[0] ? 32 : 20;
  return tint(x > 0 ? "--up" : "--down", pct);
}

export function trendKey(r: HoldingRow): "up" | "base" | "top" | "fall" | "weak" | "none" {
  if (r.etf || !r.inScreen || r.stage === null) return "none";
  if (r.stage === 2) return "up";
  if (r.stage === 3) return "top";
  if (r.stage === 4) return r.weak || r.deep ? "weak" : "fall";
  return "base";
}

const TREND_FILL: Record<ReturnType<typeof trendKey>, [string, string]> = {
  up: [tint("--up", 46), "Uptrend"],
  base: [tint("--ink-3", 22), "Basing"],
  top: [tint("--amber", 46), "Topping"],
  fall: [tint("--down", 30), "Falling"],
  weak: [tint("--down", 60), "Weak or deep"],
  none: ["var(--surface-2)", "No reading / ETF"],
};
const BIZ_FILL: Record<string, [string, string]> = {
  growing: [tint("--up", 46), "Growing"],
  mixed: [tint("--ink-3", 22), "Mixed"],
  shrinking: [tint("--down", 46), "Shrinking"],
  none: ["var(--surface-2)", "No data / ETF"],
};

function fill(r: HoldingRow, by: ColourBy): string {
  if (by === "gain") return moveFill(r.pnlPct, [5, 15, 30]);
  if (by === "today") return moveFill(r.dayPct, [0.5, 1.5, 3]);
  if (by === "trend") return TREND_FILL[trendKey(r)][0];
  return BIZ_FILL[r.business?.trend ?? "none"]![0];
}

function metric(r: HoldingRow, by: ColourBy): string {
  if (by === "gain") return signedPct(r.pnlPct, 0);
  if (by === "today") return signedPct(r.dayPct, 1);
  if (by === "trend") return TREND_FILL[trendKey(r)][1];
  return BIZ_FILL[r.business?.trend ?? "none"]![1];
}

const GAP = 2;
const HEAD = 18;

export function AllocationMap({ rows, onPick }: { rows: HoldingRow[]; onPick: (isin: string) => void }) {
  const [by, setBy] = useState<ColourBy>("gain");
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ r: HoldingRow; x: number; y: number } | null>(null);
  const H = w < 560 ? 340 : 400;

  const layout = useMemo(() => {
    const groups = new Map<string, HoldingRow[]>();
    for (const r of rows) if ((r.value ?? 0) > 0) groups.set(r.sectorName, [...(groups.get(r.sectorName) ?? []), r]);
    const sectors = squarify(
      [...groups].map(([s, xs]) => ({ v: xs.reduce((a, r) => a + (r.value ?? 0), 0), d: { s, xs } })),
      { x: 0, y: 0, w, h: H },
    );
    return sectors.map(({ r, d }) => {
      const inner = { x: r.x + GAP / 2, y: r.y + GAP / 2, w: r.w - GAP, h: r.h - GAP };
      const head = inner.w > 90 && inner.h > 64 ? HEAD : 0;
      const tiles = squarify(d.xs.map((x) => ({ v: x.value ?? 0, d: x })), { x: inner.x, y: inner.y + head, w: inner.w, h: inner.h - head });
      return { sector: d.s, weight: d.xs.reduce((a, x) => a + (x.weight ?? 0), 0), box: inner, head, tiles };
    });
  }, [rows, w, H]);

  const legend =
    by === "gain" || by === "today"
      ? null
      : Object.values(by === "trend" ? TREND_FILL : BIZ_FILL).map(([c, l]) => ({ c, l }));
  const steps = by === "gain" ? ["−30%", "−15%", "−5%", "0", "+5%", "+15%", "+30%"] : ["−3%", "−1.5%", "−0.5%", "0", "+0.5%", "+1.5%", "+3%"];

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          label="Colour by"
          value={by}
          onChange={setBy}
          options={[
            { value: "gain", label: "Gain" },
            { value: "today", label: "Today" },
            { value: "trend", label: "Trend" },
            { value: "business", label: "Business" },
          ]}
        />
        {legend ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
            {legend.map((x) => (
              <span key={x.l} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[3px] border border-line" style={{ background: x.c }} aria-hidden="true" />
                {x.l}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-ink-3" aria-label="Colour scale">
            <span>Loss</span>
            {[-3, -2, -1, 0, 1, 2, 3].map((k, j) => (
              <span
                key={k}
                title={steps[j]}
                className="h-2.5 w-4 rounded-[3px]"
                style={{ background: k === 0 ? tint("--ink-3", 14) : tint(k > 0 ? "--up" : "--down", [20, 32, 46, 60][Math.abs(k)]!) }}
              />
            ))}
            <span>Gain</span>
          </div>
        )}
      </div>
      <div ref={ref} className="relative min-w-0" style={{ height: H }} onPointerLeave={() => setHover(null)}>
        {w > 0 &&
          layout.map((g) => (
            <div key={g.sector}>
              {g.head > 0 && (
                <div className="absolute truncate px-1 text-[10px] font-medium tracking-wide text-ink-3 uppercase" style={{ left: g.box.x, top: g.box.y + 1, width: g.box.w, height: HEAD }}>
                  {g.sector} <span className="num font-normal">{g.weight.toFixed(0)}%</span>
                </div>
              )}
              {g.tiles.map(({ r: t, d: r }) => {
                const tw = t.w - GAP;
                const th = t.h - GAP;
                const big = tw > 78 && th > 40;
                const mid = !big && tw > 46 && th > 24;
                return (
                  <button
                    key={r.isin}
                    type="button"
                    onClick={() => onPick(r.isin)}
                    onPointerMove={(e) => {
                      const box = ref.current?.getBoundingClientRect();
                      if (box) setHover({ r, x: e.clientX - box.left, y: e.clientY - box.top + 16 });
                    }}
                    onFocus={() => setHover({ r, x: t.x + tw / 2, y: t.y + th })}
                    onBlur={() => setHover(null)}
                    aria-label={`${displayName(r)}: ${inr(r.value)}, ${(r.weight ?? 0).toFixed(1)}% of the money, ${metric(r, by)}`}
                    className="absolute overflow-hidden rounded-md text-left transition-[filter] outline-none hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ink"
                    style={{ left: t.x + GAP / 2, top: t.y + GAP / 2, width: Math.max(0, tw), height: Math.max(0, th), background: fill(r, by) }}
                  >
                    {big && (
                      <span className="flex h-full flex-col justify-between p-2">
                        <span className="line-clamp-2 text-[12px] leading-tight font-medium text-ink">{displayName(r)}</span>
                        <span className="flex items-baseline justify-between gap-1 text-[11px] text-ink-2">
                          <span className="num">{(r.weight ?? 0).toFixed(1)}%</span>
                          <span className="num truncate text-ink">{metric(r, by)}</span>
                        </span>
                      </span>
                    )}
                    {mid && (
                      <span className="flex h-full flex-col justify-between px-1.5 py-1">
                        <span className="truncate text-[10px] leading-tight text-ink">{displayName(r)}</span>
                        {th >= 38 && <span className="num truncate text-[10px] text-ink-2">{metric(r, by)}</span>}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        {hover && (
          <Tip x={hover.x} y={hover.y} box={w} width={220}>
            <div className="mb-1 font-medium text-ink">{displayName(hover.r)}</div>
            <div className="mb-1.5 text-[11px] text-ink-3">
              {hover.r.symbol} · {hover.r.sectorName}
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <dt className="text-ink-3">Value</dt>
              <dd className="num text-right text-ink">
                {inr(hover.r.value)} · {(hover.r.weight ?? 0).toFixed(1)}%
              </dd>
              <dt className="text-ink-3">Gain</dt>
              <dd className={`num text-right ${(hover.r.pnl ?? 0) >= 0 ? "text-up" : "text-down"}`}>
                {inr(hover.r.pnl, true)} · {signedPct(hover.r.pnlPct)}
              </dd>
              <dt className="text-ink-3">Today</dt>
              <dd className="num text-right text-ink">{signedPct(hover.r.dayPct, 2)}</dd>
              <dt className="text-ink-3">Trend</dt>
              <dd className="text-right text-ink">{TREND_FILL[trendKey(hover.r)][1]}</dd>
              {!hover.r.etf && (
                <>
                  <dt className="text-ink-3">Business</dt>
                  <dd className="text-right text-ink">{BIZ_FILL[hover.r.business?.trend ?? "none"]![1]}</dd>
                </>
              )}
            </dl>
            <div className="mt-1.5 text-[10px] text-ink-3">Tap to open it in the list</div>
          </Tip>
        )}
      </div>
    </div>
  );
}
