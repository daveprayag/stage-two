"use client";
import { price } from "@/lib/format";
import { Change } from "./Badges";
import { freshFor, liveLabel, useLiveFile } from "./live";

/** Index level for the market box: live from NSE during the session (and after it until the lists update), else the close. */
export function LiveIndex({ name, close, chgPct, asOf }: { name: string; close: number; chgPct: number; asOf: string }) {
  const f = freshFor(useLiveFile(), asOf);
  const live = f?.indices[name];
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
