"use client";
/**
 * Three views of how the portfolio is built: sector weights against the concentration limit, gain and loss by
 * holding, and each stock's price trend against its business trend.
 */
import { useMemo, useState } from "react";
import { SECTOR_LIMIT, SMALL_WEIGHT, type HoldingRow } from "@/engine/holdings";
import { displayName } from "../names";
import { inr, Segmented, signedPct, tint, Tip, useWidth } from "./base";
import { trendKey } from "./AllocationMap";

// ---------------------------------------------------------------- sectors and concentration

export function SectorBars({ rows }: { rows: HoldingRow[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const sectors = useMemo(() => {
    const m = new Map<string, HoldingRow[]>();
    for (const r of rows) m.set(r.sectorName, [...(m.get(r.sectorName) ?? []), r]);
    return [...m]
      .map(([s, xs]) => ({ s, xs, w: xs.reduce((a, r) => a + (r.weight ?? 0), 0), v: xs.reduce((a, r) => a + (r.value ?? 0), 0) }))
      .sort((a, b) => b.w - a.w);
  }, [rows]);
  // Past the 7 biggest, sectors fold into one "Other" bar (its tooltip lists them).
  const TOP = 7;
  const shownSectors =
    sectors.length > TOP + 1
      ? [
          ...sectors.slice(0, TOP),
          {
            s: `${sectors.length - TOP} other sectors`,
            xs: sectors.slice(TOP).flatMap((x) => x.xs),
            w: sectors.slice(TOP).reduce((a, x) => a + x.w, 0),
            v: sectors.slice(TOP).reduce((a, x) => a + x.v, 0),
            other: true,
          },
        ]
      : sectors;
  const max = Math.max(SECTOR_LIMIT * 1.2, ...sectors.map((x) => x.w));
  const byWeight = [...rows].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const top5 = byWeight.slice(0, 5).reduce((a, r) => a + (r.weight ?? 0), 0);
  const small = rows.filter((r) => r.weight !== null && r.weight < SMALL_WEIGHT);
  const lead = byWeight[0];

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-3 gap-2">
        {[
          ["Top 5 holdings", `${top5.toFixed(0)}%`, "of the money"],
          ["Largest", `${(lead?.weight ?? 0).toFixed(0)}%`, lead ? displayName(lead) : "—"],
          [`Under ${SMALL_WEIGHT}% each`, String(small.length), `${small.reduce((a, r) => a + (r.weight ?? 0), 0).toFixed(0)}% together`],
        ].map(([k, v, s]) => (
          <div key={k} className="min-w-0 rounded-xl bg-surface-2/60 px-3 py-2.5">
            <dt className="truncate text-[11px] text-ink-3">{k}</dt>
            <dd className="mt-0.5 text-xl font-medium tracking-tight text-ink">{v}</dd>
            <dd className="truncate text-[11px] text-ink-3">{s}</dd>
          </div>
        ))}
      </dl>
      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 border-l border-line-strong" style={{ left: `calc(${(SECTOR_LIMIT / max) * 100}% )` }} aria-hidden="true">
          <span className="absolute -top-4 -translate-x-1/2 text-[10px] whitespace-nowrap text-ink-3">{SECTOR_LIMIT}% limit</span>
        </div>
        <ul className="flex flex-col gap-2.5 pt-4">
          {shownSectors.map((x) => {
            const over = x.s !== "ETFs" && !("other" in x) && x.w > SECTOR_LIMIT;
            return (
              <li key={x.s} className="relative" onPointerEnter={() => setHover(x.s)} onPointerLeave={() => setHover(null)}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
                  <span className="min-w-0 truncate text-ink-2">
                    {x.s} {!("other" in x) && <span className="text-ink-3">· {x.xs.length}</span>}
                  </span>
                  <span className="num shrink-0 text-ink">
                    {x.w.toFixed(1)}%{over && <span className="ml-1 font-sans text-[10px] text-amber">over limit</span>}
                  </span>
                </div>
                <div className="h-2 w-full">
                  <div className="h-full rounded-r-[4px]" style={{ width: `${(x.w / max) * 100}%`, background: over ? "var(--amber)" : "other" in x ? "var(--ink-3)" : "var(--blue)", opacity: hover && hover !== x.s ? 0.45 : 1 }} />
                </div>
                {hover === x.s && (
                  <div className="pointer-events-none absolute top-full left-0 z-20 mt-1 w-64 rounded-xl border border-line bg-surface/95 p-2.5 text-xs shadow-lg backdrop-blur-sm">
                    <div className="mb-1 font-medium text-ink">
                      {inr(x.v)} · {x.w.toFixed(1)}%
                    </div>
                    <div className="leading-relaxed text-ink-3">{"other" in x ? sectors.slice(TOP).map((y) => `${y.s} ${y.w.toFixed(1)}%`).join(", ") : x.xs.map((r) => displayName(r)).join(", ")}</div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- gain and loss by holding

export function GainBars({ rows, onPick }: { rows: HoldingRow[]; onPick: (isin: string) => void }) {
  const [unit, setUnit] = useState<"rs" | "pct">("rs");
  const [all, setAll] = useState(false);
  const val = (r: HoldingRow) => (unit === "rs" ? r.pnl : r.pnlPct) ?? 0;
  const sorted = [...rows].filter((r) => r.pnl !== null).sort((a, b) => val(b) - val(a));
  const gains = sorted.filter((r) => val(r) > 0);
  const losses = sorted.filter((r) => val(r) < 0);
  const shown = all ? sorted : [...gains.slice(0, 5), ...losses.slice(-5)];
  const hiPos = Math.max(0, ...sorted.map(val));
  const hiNeg = Math.max(0, ...sorted.map((r) => -val(r)));
  const span = hiPos + hiNeg || 1;
  const zero = (hiNeg / span) * 100;
  const sumUp = gains.reduce((a, r) => a + (r.pnl ?? 0), 0);
  const sumDown = losses.reduce((a, r) => a + (r.pnl ?? 0), 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">
          <span className="text-up">{gains.length} up</span> <span className="num text-ink-2">{inr(sumUp, true)}</span> ·{" "}
          <span className="text-down">{losses.length} down</span> <span className="num text-ink-2">{inr(sumDown, true)}</span>
        </p>
        <Segmented label="Show gain as" value={unit} onChange={setUnit} options={[{ value: "rs", label: "₹" }, { value: "pct", label: "%" }]} />
      </div>
      <ul className="flex flex-col">
        {shown.map((r, i) => {
          const v = val(r);
          const wpct = (Math.abs(v) / span) * 100;
          const firstLoss = !all && i === Math.min(5, gains.length) && losses.length > 0 && gains.length > 0;
          return (
            <li key={r.isin} className={firstLoss ? "mt-1.5 border-t border-dashed border-line pt-1.5" : ""}>
              <button type="button" onClick={() => onPick(r.isin)} className="group grid w-full grid-cols-[minmax(0,8.5rem)_minmax(0,1fr)_4.5rem] items-center gap-2 rounded-md py-1 text-left hover:bg-surface-2/60">
                <span className="truncate pl-1 text-xs text-ink-2 group-hover:text-ink">{displayName(r)}</span>
                <span className="relative h-3">
                  <span className="absolute inset-y-[-3px] border-l border-line-strong" style={{ left: `${zero}%` }} aria-hidden="true" />
                  <span
                    className={`absolute inset-y-0 ${v >= 0 ? "rounded-r-[4px]" : "rounded-l-[4px]"}`}
                    style={{ left: v >= 0 ? `${zero}%` : `${zero - wpct}%`, width: `${wpct}%`, background: v >= 0 ? "var(--up)" : "var(--down)" }}
                  />
                </span>
                <span className={`num pr-1 text-right text-xs ${v >= 0 ? "text-up" : "text-down"}`}>{unit === "rs" ? inr(r.pnl, true) : signedPct(r.pnlPct, 0)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {sorted.length > 10 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="self-start text-xs text-ink-2 hover:text-ink hover:underline">
          {all ? "Show the top 5 each way" : `Show all ${sorted.length}`}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- price trend × business

const ROWS: { k: ReturnType<typeof trendKey>; label: string; dot: string; note?: string }[] = [
  { k: "up", label: "Uptrend", dot: "bg-up" },
  { k: "base", label: "Basing", dot: "bg-ink-3" },
  { k: "top", label: "Topping", dot: "bg-amber" },
  { k: "fall", label: "Falling", dot: "bg-down" },
  { k: "weak", label: "Weak or deep", dot: "bg-down", note: "tested: kept lagging" },
  { k: "none", label: "No reading", dot: "bg-line-strong" },
];
const COLS: { k: string; label: string; dot: string }[] = [
  { k: "growing", label: "Growing", dot: "bg-up" },
  { k: "mixed", label: "Mixed", dot: "bg-ink-3" },
  { k: "shrinking", label: "Shrinking", dot: "bg-down" },
  { k: "none", label: "No data yet", dot: "bg-line-strong" },
];

export function TrendMatrix({ rows, onPick }: { rows: HoldingRow[]; onPick: (isin: string) => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ r: HoldingRow; x: number; y: number } | null>(null);
  const stocks = rows.filter((r) => !r.etf);
  const cell = (rk: string, ck: string) => stocks.filter((r) => trendKey(r) === rk && (r.business?.trend ?? "none") === ck).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const usedRows = ROWS.filter((x) => COLS.some((c) => cell(x.k, c.k).length));
  const maxW = Math.max(...stocks.map((r) => r.weight ?? 0), 1);
  const chip = (r: HoldingRow) => {
    const size = 6 + Math.sqrt((r.weight ?? 0) / maxW) * 10;
    return (
      <button
        key={r.isin}
        type="button"
        onClick={() => onPick(r.isin)}
        onPointerMove={(e) => {
          const b = ref.current?.getBoundingClientRect();
          if (b) setHover({ r, x: e.clientX - b.left, y: e.clientY - b.top + 14 });
        }}
        onFocus={(e) => {
          const b = ref.current?.getBoundingClientRect();
          const t = e.currentTarget.getBoundingClientRect();
          if (b) setHover({ r, x: t.left - b.left, y: t.bottom - b.top + 6 });
        }}
        onBlur={() => setHover(null)}
        className="inline-flex max-w-full items-center gap-1 rounded-full bg-surface py-0.5 pr-2 pl-1 text-[11px] text-ink-2 shadow-[0_0_0_1px_var(--line)] hover:text-ink"
      >
        <span className="flex w-4 shrink-0 items-center justify-center">
          <span className="rounded-full bg-blue" style={{ width: size, height: size }} aria-hidden="true" />
        </span>
        <span className="truncate">{displayName(r)}</span>
      </button>
    );
  };
  const narrow = w > 0 && w < 560;
  const tone = (rk: string, ck: string) =>
    rk === "weak" ? tint("--down", ck === "shrinking" ? 16 : 9) : rk === "up" && ck === "growing" ? tint("--up", 12) : "color-mix(in oklab, var(--surface-2) 60%, transparent)";

  return (
    <div ref={ref} className="relative" onPointerLeave={() => setHover(null)}>
      {narrow ? (
        <div className="flex flex-col gap-2">
          {usedRows.map((x) => (
            <div key={x.k} className="rounded-xl p-2.5" style={{ background: x.k === "weak" ? tint("--down", 10) : "color-mix(in oklab, var(--surface-2) 60%, transparent)" }}>
              <div className="mb-1.5 flex items-baseline gap-1.5 text-xs text-ink">
                <span className={`h-1.5 w-1.5 self-center rounded-full ${x.dot}`} aria-hidden="true" />
                {x.label}
                {x.note && <span className="text-[10px] text-down">· {x.note}</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                {COLS.filter((c) => cell(x.k, c.k).length).map((c) => (
                  <div key={c.k} className="flex items-start gap-2">
                    <span className="inline-flex w-[4.5rem] shrink-0 items-center gap-1 pt-1 text-[10px] text-ink-3">
                      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
                      {c.label}
                    </span>
                    <div className="flex min-w-0 flex-wrap gap-1">{cell(x.k, c.k).map(chip)}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="scroll-x -mx-1 px-1">
        <table className="w-full min-w-[36rem] table-fixed border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th className="w-24 text-left font-normal text-ink-3">
                <span className="text-[10px] tracking-wide uppercase">Price ↓ · Business →</span>
              </th>
              {COLS.map((c) => (
                <th key={c.k} className="px-1 pb-1 text-left font-normal text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
                    {c.label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {usedRows.map((x) => (
              <tr key={x.k}>
                <th scope="row" className="py-1 pr-1 text-left align-top font-normal">
                  <span className="inline-flex items-center gap-1.5 text-ink-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${x.dot}`} aria-hidden="true" />
                    {x.label}
                  </span>
                  {x.note && <span className="block pl-3 text-[10px] text-down">{x.note}</span>}
                </th>
                {COLS.map((c) => {
                  const xs = cell(x.k, c.k);
                  const wsum = xs.reduce((a, r) => a + (r.weight ?? 0), 0);
                  return (
                    <td key={c.k} className="h-14 rounded-lg p-1.5 align-top" style={{ background: tone(x.k, c.k) }}>
                      {xs.length > 0 && (
                        <>
                          <div className="num mb-1 text-[10px] text-ink-3">{wsum.toFixed(0)}%</div>
                          <div className="flex flex-wrap gap-1">
                            {xs.map(chip)}
                          </div>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {hover && w > 0 && (
        <Tip x={hover.x} y={hover.y} box={w}>
          <div className="font-medium text-ink">{displayName(hover.r)}</div>
          <div className="mt-1 text-ink-3">
            <span className="num text-ink-2">{(hover.r.weight ?? 0).toFixed(1)}%</span> of the money · gain{" "}
            <span className={`num ${(hover.r.pnlPct ?? 0) >= 0 ? "text-up" : "text-down"}`}>{signedPct(hover.r.pnlPct, 0)}</span>
          </div>
          {hover.r.rs !== null && (
            <div className="text-ink-3">
              RS {hover.r.rs}
              {hover.r.pctFromHigh !== null ? ` · ${hover.r.pctFromHigh.toFixed(0)}% off its high` : ""}
            </div>
          )}
        </Tip>
      )}
    </div>
  );
}
