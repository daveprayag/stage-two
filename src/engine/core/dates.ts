/** Pure ISO-date helpers (no clock access). Dates are 'YYYY-MM-DD' trading dates in IST. */
import type { ISODate } from './types.js';

const MS_PER_DAY = 86_400_000;

/** Days since 1970-01-01 for an ISO date. */
export function isoToDayNumber(d: ISODate): number {
  const y = Number(d.slice(0, 4));
  const m = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  return Math.round(Date.UTC(y, m - 1, day) / MS_PER_DAY);
}

/** Inverse of isoToDayNumber. */
export function dayNumberToIso(n: number): ISODate {
  return new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** ISO date plus `days` calendar days. */
export function addCalendarDays(d: ISODate, days: number): ISODate {
  return dayNumberToIso(isoToDayNumber(d) + days);
}

/** Monday-based week number (1970-01-01 was a Thursday, so +3 aligns weeks to start on Monday). */
export function weekKey(d: ISODate): number {
  return Math.floor((isoToDayNumber(d) + 3) / 7);
}

/** True if any date in the ascending list lies in [from, to] (inclusive). Binary search. */
export function anyDateInRange(sorted: readonly ISODate[], from: ISODate, to: ISODate): boolean {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as string) < from) lo = mid + 1;
    else hi = mid;
  }
  return lo < sorted.length && (sorted[lo] as string) <= to;
}
