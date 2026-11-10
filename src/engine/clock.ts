/**
 * NSE market clock and live-price freshness. Pure and dependency-free, so the browser can use it too.
 */
import type { ISODate } from "./types";

const IST_OFFSET_MS = 5.5 * 3600_000;

export function istNow(now = Date.now()): { date: ISODate; hour: number; minute: number; weekday: number } {
  const d = new Date(now + IST_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours(), minute: d.getUTCMinutes(), weekday: d.getUTCDay() };
}

/** NSE cash market hours, Monday–Friday 09:15–15:30 IST (holidays are not modelled: quotes simply do not change). */
export function marketOpen(now = Date.now()): boolean {
  const t = istNow(now);
  const m = t.hour * 60 + t.minute;
  return t.weekday >= 1 && t.weekday <= 5 && m >= 9 * 60 + 15 && m <= 15 * 60 + 30;
}

/** When the live job runs: market hours plus 15 minutes after the close, to catch the final prices. */
export function liveWindow(now = Date.now()): boolean {
  const t = istNow(now);
  const m = t.hour * 60 + t.minute;
  return t.weekday >= 1 && t.weekday <= 5 && m >= 9 * 60 + 15 && m <= 15 * 60 + 45;
}

/** Live prices older than this during market hours count as unavailable, never shown as current. */
export const LIVE_MAX_AGE_MS = 3 * 60_000;

/**
 * Whether a live price file can be shown as the latest price: from the screen's session or later, and during market
 * hours no older than LIVE_MAX_AGE_MS. Outside market hours the last file of the day holds the closing prices.
 */
export function liveIsFresh(f: { at: string; date: string | null } | null | undefined, asOf: ISODate, now = Date.now()): boolean {
  if (!f || !f.at || !f.date || f.date < asOf) return false;
  if (!marketOpen(now)) return true;
  const age = now - Date.parse(f.at);
  // NSE's prices dated today: trading, so they must be minutes old. Dated an earlier day during market hours: no
  // trading today (a holiday), so the last close is the latest price; the engine re-checks NSE every 15 minutes then.
  return f.date >= istNow(now).date ? age <= LIVE_MAX_AGE_MS : age <= HOLIDAY_MAX_AGE_MS;
}

/** On a trading holiday the engine re-checks NSE every 15 minutes; allow a little slack. */
export const HOLIDAY_MAX_AGE_MS = 20 * 60_000;

/**
 * Milliseconds until the next live-price window opens (09:15 IST on a weekday); 0 if it is open now. Holidays are not
 * modelled: on one, the first poll finds nothing new and the next is a minute later.
 */
export function msUntilLiveWindow(now = Date.now()): number {
  if (liveWindow(now)) return 0;
  const t = new Date(now + IST_OFFSET_MS);
  let at = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), 9, 15) - IST_OFFSET_MS;
  if (now >= at) at += 86_400_000;
  while ([0, 6].includes(new Date(at + IST_OFFSET_MS).getUTCDay())) at += 86_400_000;
  return at - now;
}
