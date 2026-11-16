"use client";
/**
 * Holdings calls to the engine. Everything here needs the passcode (the Worker's WATCHLIST_KEY secret, the same one
 * the watchlist uses), so the public site never shows holdings. The engine keeps only Paytm Money's read-only token.
 */
import type { HoldingRow, HoldingsSummary } from "@/engine/holdings";
import type { HoldingsHistory } from "@/engine/portfolio";
import { useEffect, useState } from "react";
import { BROWSER_ENGINE } from "@/lib/engine";
import { savedPasscode, WatchError } from "./watch";

export interface HoldingsData {
  /** The Paytm Money API key and secret are set on the engine. */
  configured: boolean;
  /** A read-only session is live, so holdings are re-read from Paytm Money (at most once a minute). */
  connected: boolean;
  connectedAt: string | null;
  expiresAt: string | null;
  /** When Paytm Money last answered; null before the first login. */
  fetchedAt: string | null;
  syncError: string | null;
  asOf: string | null;
  liveAt: string | null;
  marketLive: boolean;
  /** Today's % change of the indices, when live prices are current. */
  indices: { "NIFTY 50": number | null; "NIFTY 500": number | null };
  rows: HoldingRow[];
  summary: HoldingsSummary | null;
}

async function call<T>(path: string, passcode: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BROWSER_ENGINE}${path.replace(/^\/api/, "")}`, { ...init, cache: "no-store", headers: { "x-watch-key": passcode } });
  } catch {
    throw new WatchError("Couldn't reach the Stage Two engine.", false);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new WatchError(body.error ?? `HTTP ${res.status}`, res.status === 401);
  return body as T;
}

export const loadHoldings = (p: string) => call<HoldingsData>("/api/holdings", p);
/** Daily closes of the held stocks and NIFTY 500, for the charts (rebuilt by the engine once per session). */
export const loadHoldingsHistory = (p: string) => call<HoldingsHistory>("/api/holdings/history", p);
export const startPaytmLogin = (p: string) => call<{ url: string }>("/api/paytm/login", p, { method: "POST" });
export const disconnectPaytm = (p: string) => call<{ ok: true }>("/api/paytm", p, { method: "DELETE" });

/** One holding (with its buys and plan dates) for a stock page; rows is empty if not held. */
export const loadHolding = (p: string, symbol: string) => call<HoldingsData>(`/api/holdings?symbol=${encodeURIComponent(symbol)}`, p);

/** Held symbols from the last read, fetched once per few minutes per tab and shared by every "Held" tag on a page. */
let held: { at: number; p: Promise<Set<string>> } | null = null;
export function heldSymbols(): Promise<Set<string>> {
  const pass = savedPasscode();
  if (!pass) return Promise.resolve(new Set());
  if (!held || Date.now() - held.at > 5 * 60_000) {
    held = {
      at: Date.now(),
      p: call<{ symbols: string[] }>("/api/holdings/symbols", pass)
        .then((r) => new Set(r.symbols))
        .catch(() => new Set<string>()),
    };
  }
  return held.p;
}

export function useHeld(symbol: string): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void heldSymbols().then((s) => live && setOn(s.has(symbol)));
    return () => {
      live = false;
    };
  }, [symbol]);
  return on;
}
