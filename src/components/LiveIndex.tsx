"use client";
import type { LiveFile } from "@/engine/jobs";
import { price } from "@/lib/format";
import { Change } from "./Badges";
import { liveLabel, useLivePrices } from "./live";

/** Index level for the market box: live from NSE during the session, else the close. Never an old level in market hours. */
export function LiveIndex({ name, close, chgPct, asOf, initialLive }: { name: string; close: number; chgPct: number; asOf: string; initialLive: LiveFile | null }) {
  const { file: f, unavailable } = useLivePrices(asOf, initialLive);
  const live = f?.indices[name];
  if (unavailable || (f && !live && f.marketOpen)) {
    return (
      <p role="alert" className="mt-1 text-sm text-down">
        Live level unavailable, retrying
      </p>
    );
  }
  return (
    <>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="num text-2xl text-ink">{price(live ? live.last : close)}</span>
        <Change value={live ? live.pChange : chgPct} digits={2} className="text-sm" />
      </div>
      {f && live && (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-3">
          <span className={`h-1.5 w-1.5 rounded-full bg-up ${f.marketOpen ? "animate-pulse" : ""}`} aria-hidden="true" />
          {liveLabel(f)} · day {price(live.low)}–{price(live.high)}
        </div>
      )}
    </>
  );
}
