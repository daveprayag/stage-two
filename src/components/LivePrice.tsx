"use client";
import { price } from "@/lib/format";
import { Change } from "./Badges";
import { quoteTime, useLiveQuote, type LiveState } from "./live";

/**
 * Price block for the stock page: live in market hours (or today's close once NSE has it), else the last close.
 * In market hours without a current quote it shows an error, never an old price.
 */
export function LivePrice({ symbol, close, chg, date, initial }: { symbol: string; close: number; chg: number; date: string; initial: LiveState | null }) {
  const { quote, marketOpen, failed } = useLiveQuote(symbol, initial);
  const live = quote && quote.date && quote.date >= date ? quote : null;
  if (failed) {
    return (
      <div className="sm:text-right" role="alert">
        <div className="num text-3xl text-ink-3">—</div>
        <div className="mt-1 text-sm text-down">Live price unavailable, retrying</div>
      </div>
    );
  }
  return (
    <div className="sm:text-right">
      <div className="num text-3xl text-ink">{price(live ? live.last : close)}</div>
      <div className="mt-1 flex items-center gap-1.5 text-sm sm:justify-end">
        <Change value={live ? live.pChange : chg} digits={2} />
        <span className="text-ink-3">·</span>
        {live ? (
          <span className="flex items-center gap-1.5 text-ink-3">
            {marketOpen && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-up" aria-hidden="true" />}
            {marketOpen ? `Live ${quoteTime(live.time)}` : `NSE ${quoteTime(live.time)}`}
          </span>
        ) : (
          <span className="text-ink-3">close {date}</span>
        )}
      </div>
    </div>
  );
}
