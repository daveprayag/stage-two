"use client";
import { useEffect, useState } from "react";
import type { HoldingRow } from "@/engine/holdings";
import { int, price } from "@/lib/format";
import { Change } from "./Badges";
import { loadHolding } from "./holdings";
import { PlanLines } from "./PlanLines";
import { savedPasscode } from "./watch";

/** Stock page: your shares in this stock and each buy against the plan. Only on a device with the passcode. */
export function YourHolding({ symbol }: { symbol: string }) {
  const [h, setH] = useState<HoldingRow | null>(null);
  useEffect(() => {
    const p = savedPasscode();
    if (!p) return;
    let live = true;
    loadHolding(p, symbol)
      .then((d) => live && setH(d.rows[0] ?? null))
      .catch(() => live && setH(null));
    return () => {
      live = false;
    };
  }, [symbol]);
  if (!h) return null;
  return (
    <section className="rounded-2xl border border-line bg-surface px-4 py-3.5 sm:px-5">
      <h2 className="text-sm font-medium text-ink">Your holding</h2>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-sm text-ink-2">
        <span className="num">
          {int(h.qty)} {h.qty === 1 ? "share" : "shares"} at ₹{price(h.avg)} avg
        </span>
        <span className="text-ink-3">·</span>
        <span className="num">₹{int(Math.round(h.value ?? 0))}</span>
        <Change value={h.pnlPct} />
      </p>
      <div className="mt-1.5">
        <PlanLines lots={h.lots} etf={h.etf} />
      </div>
    </section>
  );
}
