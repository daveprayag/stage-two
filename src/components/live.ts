"use client";
import { useEffect, useState } from "react";
import type { LiveFile } from "@/engine/jobs";
import type { LiveQuote } from "@/engine/nse";
import { ENGINE_URL } from "@/lib/engine";

export interface LiveState {
  quote: LiveQuote | null;
  marketOpen: boolean;
}

/** Poll the engine for one stock's live quote (with intraday high/low): every 30 s while the market is open and the tab is visible. */
export function useLiveQuote(symbol: string): LiveState {
  const [state, setState] = useState<LiveState>({ quote: null, marketOpen: false });
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (document.visibilityState === "visible") {
        try {
          const r = await fetch(`${ENGINE_URL}/api/live/${encodeURIComponent(symbol)}`);
          if (r.ok) {
            const j = (await r.json()) as LiveState;
            if (!stop) setState(j);
            timer = setTimeout(load, j.marketOpen ? 30_000 : 10 * 60_000);
            return;
          }
        } catch {
          // keep the last value
        }
      }
      if (!stop) timer = setTimeout(load, 30_000);
    };
    void load();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [symbol]);
  return state;
}

// One shared poll of /api/live per tab (every stock's last price + every index), whatever number of components use it.
let liveFile: LiveFile | null = null;
const listeners = new Set<(f: LiveFile | null) => void>();
let liveTimer: ReturnType<typeof setTimeout> | undefined;

async function pollLive(): Promise<void> {
  if (document.visibilityState === "visible") {
    try {
      const r = await fetch(`${ENGINE_URL}/api/live`);
      if (r.ok) {
        const j = (await r.json()) as LiveFile;
        // Older files (before every-stock live prices) have no q.
        liveFile = j.q ? j : null;
        for (const l of listeners) l(liveFile);
      }
    } catch {
      // keep the last value
    }
  }
  liveTimer = listeners.size ? setTimeout(pollLive, liveFile?.marketOpen ? 60_000 : 5 * 60_000) : undefined;
}

/** Every stock's latest NSE price and every index (the engine refreshes them each minute in market hours). */
export function useLiveFile(): LiveFile | null {
  const [f, setF] = useState<LiveFile | null>(liveFile);
  useEffect(() => {
    listeners.add(setF);
    if (!liveTimer) void pollLive();
    else setF(liveFile);
    return () => {
      listeners.delete(setF);
    };
  }, []);
  return f;
}

/** The live file if its prices are from the screen's session or later (older ones would be stale). */
export function freshFor(f: LiveFile | null, asOf: string): LiveFile | null {
  return f && f.date && f.date >= asOf ? f : null;
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
