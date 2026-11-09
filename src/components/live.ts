"use client";
import { useEffect, useState } from "react";
import type { LiveQuote } from "@/engine/nse";
import { ENGINE_URL } from "@/lib/engine";

export interface LiveState {
  quote: LiveQuote | null;
  marketOpen: boolean;
}

/** Poll the engine for one stock's live quote: every minute while the market is open and the tab is visible. */
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
            timer = setTimeout(load, j.marketOpen ? 60_000 : 10 * 60_000);
            return;
          }
        } catch {
          // keep the last value
        }
      }
      if (!stop) timer = setTimeout(load, 60_000);
    };
    void load();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [symbol]);
  return state;
}

export interface LiveList {
  at: string | null;
  marketOpen: boolean;
  quotes: Record<string, LiveQuote>;
}

/** The engine's live quotes for the watch set (refreshed every 5 minutes in market hours). */
export function useLiveList(): LiveList {
  const [state, setState] = useState<LiveList>({ at: null, marketOpen: false, quotes: {} });
  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch(`${ENGINE_URL}/api/live`);
        if (r.ok && !stop) setState((await r.json()) as LiveList);
      } catch {
        // keep the last value
      }
    };
    void load();
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 2 * 60_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  return state;
}

/** "09-Nov-2026 13:36:23" → "1:36 pm". */
export function quoteTime(t: string): string {
  const m = /(\d{2}):(\d{2})/.exec(t);
  if (!m) return t;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h >= 12 ? "pm" : "am"}`;
}
