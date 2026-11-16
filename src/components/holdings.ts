"use client";
/**
 * Holdings calls to the engine. Everything here needs the passcode (the Worker's WATCHLIST_KEY secret, the same one
 * the watchlist uses), so the public site never shows holdings. The engine keeps only Paytm Money's read-only token.
 */
import type { HoldingRow, HoldingsSummary } from "@/engine/holdings";
import { ENGINE_URL } from "@/lib/engine";
import { WatchError } from "./watch";

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
    res = await fetch(`${ENGINE_URL}${path}`, { ...init, cache: "no-store", headers: { "x-watch-key": passcode } });
  } catch {
    throw new WatchError("Couldn't reach the Stage Two engine.", false);
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new WatchError(body.error ?? `HTTP ${res.status}`, res.status === 401);
  return body as T;
}

export const loadHoldings = (p: string) => call<HoldingsData>("/api/holdings", p);
export const startPaytmLogin = (p: string) => call<{ url: string }>("/api/paytm/login", p, { method: "POST" });
export const disconnectPaytm = (p: string) => call<{ ok: true }>("/api/paytm", p, { method: "DELETE" });
