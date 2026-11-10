"use client";
import { useEffect, useState } from "react";
import type { LiveFile } from "@/engine/jobs";
import type { LiveQuote } from "@/engine/nse";
import { liveIsFresh, LIVE_MAX_AGE_MS, marketOpen } from "@/engine/clock";
import { ENGINE_URL } from "@/lib/engine";

export interface LiveState {
  quote: LiveQuote | null;
  marketOpen: boolean;
}

/**
 * One stock's live quote (with intraday high/low), polled every 30 s while the market is open and the tab is visible.
 * Starts from the server's copy, so the first paint already has it. `failed` = in market hours, no good quote for 3 min.
 */
export function useLiveQuote(symbol: string, initial: LiveState | null = null): LiveState & { failed: boolean } {
  const [state, setState] = useState<LiveState>(initial ?? { quote: null, marketOpen: false });
  const [okAt, setOkAt] = useState<number>(() => (initial?.quote ? Date.now() : 0));
  const now = useTick(30_000);
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch(`${ENGINE_URL}/api/live/${encodeURIComponent(symbol)}`, { cache: "no-store" });
          if (r.ok) {
            const j = (await r.json()) as LiveState;
            if (!stop) {
              setState(j);
              if (j.quote) setOkAt(Date.now());
            }
            timer = setTimeout(load, j.marketOpen ? 30_000 : 10 * 60_000);
            return;
          }
        } catch {
          // counted as a failure once the last good quote is too old
        }
      }
      if (!stop) timer = setTimeout(load, 30_000);
    };
    // The server already sent a fresh copy: wait one interval before the first poll.
    timer = setTimeout(load, initial ? 30_000 : 0);
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [symbol, initial]);
  const failed = marketOpen(now) && (!state.quote || now - okAt > LIVE_MAX_AGE_MS);
  return { ...state, failed };
}

/** Re-render every `ms`, so freshness is re-checked even when no new data arrives. */
function useTick(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// One shared poll of /api/live per tab (every stock's last price + every index), whatever number of components use it.
let liveFile: LiveFile | null = null;
const listeners = new Set<(f: LiveFile | null) => void>();
let liveTimer: ReturnType<typeof setTimeout> | undefined;

const newer = (a: LiveFile | null, b: LiveFile | null) => (!a ? b : !b ? a : a.at >= b.at ? a : b);

async function pollLive(): Promise<void> {
  if (document.visibilityState === "visible") {
    try {
      const r = await fetch(`${ENGINE_URL}/api/live`, { cache: "no-store" });
      if (r.ok) {
        const j = (await r.json()) as LiveFile;
        // Older files (before every-stock live prices) have no q.
        liveFile = newer(liveFile, j.q ? j : null);
      }
    } catch {
      // freshness is re-checked on every render; an old file stops counting as live after 3 min
    }
    for (const l of listeners) l(liveFile);
  }
  liveTimer = listeners.size ? setTimeout(pollLive, marketOpen() ? 60_000 : 5 * 60_000) : undefined;
}

export interface LivePrices {
  /** The live file, only if it can be shown as the latest prices. */
  file: LiveFile | null;
  /** Market hours and no fresh prices: show an error, not old prices. */
  unavailable: boolean;
}

/**
 * Every stock's latest NSE price and every index (the engine refreshes them each minute in market hours). Starts from
 * the server's copy so the first paint is already current; never returns prices older than the rules in clock.ts.
 */
export function useLivePrices(asOf: string, initial: LiveFile | null): LivePrices {
  if (initial?.q) liveFile = newer(liveFile, initial);
  const [f, setF] = useState<LiveFile | null>(liveFile);
  const now = useTick(30_000);
  useEffect(() => {
    listeners.add(setF);
    // The server sent a current copy: the first poll can wait a minute.
    if (!liveTimer) liveTimer = setTimeout(pollLive, initial?.q ? 60_000 : 0);
    setF(liveFile);
    return () => {
      listeners.delete(setF);
    };
  }, [initial]);
  const fresh = liveIsFresh(f, asOf, now);
  return { file: fresh ? f : null, unavailable: !fresh && marketOpen(now) };
}

/** "Live 2:18 pm" in market hours, else "NSE 3:30 pm". */
export function liveLabel(f: LiveFile): string {
  return `${f.marketOpen ? "Live" : "NSE"} ${quoteTime(f.time)}`;
}

/** "09-Nov-2026 13:36:23" → "1:36 pm". */
export function quoteTime(t: string): string {
  const m = /(\d{2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "pm" : "am"}`;
}
