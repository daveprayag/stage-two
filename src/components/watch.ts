"use client";
/**
 * Watchlist calls to the engine. Reads are public; changes need the passcode (the Worker's WATCHLIST_KEY secret),
 * which is remembered in this browser after the first successful use.
 */
import type { WatchRow, WatchSummary } from "@/engine/watchlist";
import { ENGINE_URL } from "@/lib/engine";

export interface WatchData {
  asOf: string;
  liveAt: string | null;
  /** Live prices are current (in market hours: under 3 minutes old). */
  liveFresh: boolean;
  /** NSE is trading right now (false on holidays). */
  marketLive: boolean;
  items: WatchRow[];
  summary: WatchSummary[];
  canEdit: boolean;
}

const KEY = "stage-two-watch-key";

export function savedPasscode(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function savePasscode(v: string): void {
  try {
    if (v) localStorage.setItem(KEY, v);
    else localStorage.removeItem(KEY);
  } catch {
    // private mode: the passcode is asked again next time
  }
}

/** Error with the engine's message, and whether the passcode was the problem. */
export class WatchError extends Error {
  constructor(message: string, readonly auth: boolean) {
    super(message);
  }
}

async function call<T>(path: string, init: RequestInit = {}, passcode?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${ENGINE_URL}/api/watchlist${path}`, {
      ...init,
      cache: "no-store",
      headers: { ...(init.body ? { "content-type": "application/json" } : {}), ...(passcode ? { "x-watch-key": passcode } : {}) },
    });
  } catch {
    throw new WatchError("Couldn't reach the Stage Two engine.", false);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new WatchError(body.error ?? `HTTP ${res.status}`, res.status === 401);
  return body as T;
}

export const loadWatchlist = () => call<WatchData>("");
export const loadWatchedSymbols = () => call<{ symbols: string[]; canEdit: boolean }>("/symbols");
export const checkPasscode = (p: string) => call<{ ok: true }>("/check", {}, p);
export const addToWatchlist = (symbol: string, p: string) => call<{ ok: true }>("", { method: "POST", body: JSON.stringify({ symbol }) }, p);
export const removeFromWatchlist = (symbol: string, p: string) => call<{ ok: true }>(`/${encodeURIComponent(symbol)}`, { method: "DELETE" }, p);
