/**
 * "On Momentum leaders since": when each stock's current stretch on Momentum leaders began. Stocks drop off the list
 * for a day or two and come back all the time (RS hovers around 80), so a break of up to SINCE_GAP sessions does not
 * end a stretch: in the 2026 replay 86% of breaks were 10 sessions or shorter. The EOD job keeps the state in
 * P.since and adds `momentumSince` to each row on the list. Sessions before 2026-11-09 were back-filled by replaying
 * the screen over the stored prices (scripts/backfill-since.mts). Pure helpers.
 */
import type { ISODate, ScreenRow } from "./types";

/** Longest break (sessions off the list) that still counts as the same stretch. */
export const SINCE_GAP = 10;

export interface SinceFile {
  version: 1;
  /** First session the state covers: a stretch starting here may have started earlier. */
  from: ISODate;
  asOf: ISODate;
  /** isin → first session of the stretch and the last session it was on the list. */
  runs: Record<string, { start: ISODate; last: ISODate }>;
}

/** Advance the state to session `asOf` (sessions = every stored session, oldest first) with today's list members. */
export function updateSince(state: SinceFile | null, asOf: ISODate, sessions: readonly ISODate[], members: readonly string[]): SinceFile {
  if (state && state.asOf > asOf) return state;
  const idx = new Map(sessions.map((d, k) => [d, k]));
  const now = idx.get(asOf);
  if (now === undefined) throw new Error(`since: ${asOf} is not a stored session`);
  /** Sessions since `d` (0 = today); Infinity once it has left the stored window. */
  const since = (d: ISODate) => {
    const k = idx.get(d);
    return k === undefined ? Infinity : now - k;
  };
  const prev = state?.runs ?? {};
  const on = new Set(members);
  const runs: SinceFile["runs"] = {};
  for (const isin of members) {
    const r = prev[isin];
    // Back today after missing (since − 1) sessions: the same stretch if that break is short enough.
    runs[isin] = r && since(r.last) - 1 <= SINCE_GAP ? { start: r.start, last: asOf } : { start: asOf, last: asOf };
  }
  // Off the list today: kept while the break so far (today included) could still be a short one.
  for (const [isin, r] of Object.entries(prev)) if (!on.has(isin) && since(r.last) <= SINCE_GAP) runs[isin] = r;
  return { version: 1, from: state?.from ?? asOf, asOf, runs };
}

/** Set `momentumSince` on the rows on Momentum leaders (closeOn: the split-adjusted close of that stock on a session). */
export function attachSince(rows: ScreenRow[], state: SinceFile, closeOn: (isin: string, d: ISODate) => number | null): void {
  for (const r of rows) {
    const run = r.tags.includes("momentum") ? state.runs[r.isin] : undefined;
    r.momentumSince = run ? { date: run.start, close: closeOn(r.isin, run.start), orEarlier: run.start === state.from } : null;
  }
}
