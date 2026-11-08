/**
 * Sector gate (rulebook v2). Ankur won't trade a stock whose sector index is below its 50 EMA, even if it hits the scan
 * (6v7NxlyhahE @01:44; wkSf4tDwmx0 @05:05; 64gqyT84iEQ @09:07; jh5hXaoQgog @02:52; mwFLohDp8Lc: "50 EMA = bare minimum").
 * He also makes no new buys in a sector that just ran hard in a few days — Pharma +6–8%, Auto +8–10% "very quickly",
 * a sector up 4–6 days in a row (BV-R4NstnDc @04:36; SO6sWZwfqzY @03:23; TnXBEqrfrnw @04:41; TTgFumxrJXM @19m).
 *
 * Many NSE sector indices are recent, so sectors are equal-weight baskets of our own adjusted bars, grouped by NSE
 * broad industry. Pure and causal: day t's state uses bars ≤ t.
 */
import type { SectorConfig } from './config.js';
import { ema } from './indicators.js';
import type { Instrument, ISODate } from './types.js';

export interface SectorSeries {
  sector: string;
  /** Equal-weight index level per calendar day (NaN before enough members). */
  level: Float64Array;
  ema: Float64Array;
  members: Int32Array;
}

export interface SectorState {
  /** Sector by instrument (chain ISIN). */
  sectorOf: ReadonlyMap<string, string>;
  /** sector → calendar-aligned series. */
  series: ReadonlyMap<string, SectorSeries>;
  calIndex: ReadonlyMap<ISODate, number>;
}

/**
 * Build equal-weight sector baskets: day t's basket return = mean of members' close/prevClose − 1 for members that traded
 * on t (EQ or not; adjusted bars). Level starts at 100. Days with fewer than `minMembers` traded members carry the level.
 */
export function buildSectorState(
  instruments: Iterable<Pick<Instrument, 'isin' | 'bars'>>,
  sectorOf: ReadonlyMap<string, string>,
  calendar: readonly ISODate[],
  cfg: SectorConfig,
): SectorState {
  const calIndex = new Map<ISODate, number>();
  calendar.forEach((d, i) => calIndex.set(d, i));
  const sum = new Map<string, Float64Array>();
  const cnt = new Map<string, Int32Array>();
  for (const inst of instruments) {
    const sec = sectorOf.get(inst.isin);
    if (!sec) continue;
    let s = sum.get(sec);
    let c = cnt.get(sec);
    if (!s || !c) {
      s = new Float64Array(calendar.length);
      c = new Int32Array(calendar.length);
      sum.set(sec, s);
      cnt.set(sec, c);
    }
    for (const b of inst.bars) {
      const t = calIndex.get(b.date);
      if (t === undefined || !(b.prevClose > 0)) continue;
      const r = b.close / b.prevClose - 1;
      if (!Number.isFinite(r) || Math.abs(r) > 0.5) continue; // guard against data spikes
      s[t] = (s[t] as number) + r;
      c[t] = (c[t] as number) + 1;
    }
  }
  const series = new Map<string, SectorSeries>();
  for (const [sec, s] of sum) {
    const c = cnt.get(sec) as Int32Array;
    const level = new Float64Array(calendar.length);
    let lv = 100;
    for (let t = 0; t < calendar.length; t++) {
      if ((c[t] as number) >= cfg.minMembers) lv *= 1 + (s[t] as number) / (c[t] as number);
      level[t] = lv;
    }
    series.set(sec, { sector: sec, level, ema: ema(level, cfg.gateEma), members: c });
  }
  return { sectorOf, series, calIndex };
}

/** Why a stock's sector blocks a new entry on `date` (null = allowed, or unknown sector). */
export function sectorBlock(state: SectorState | undefined, isin: string, date: ISODate, cfg: SectorConfig): string | null {
  if (!state) return null;
  const sec = state.sectorOf.get(isin);
  if (!sec) return null;
  const s = state.series.get(sec);
  const t = state.calIndex.get(date);
  if (!s || t === undefined) return null;
  const lv = s.level[t] as number;
  if (cfg.gate.enabled) {
    const e = s.ema[t] as number;
    if (Number.isFinite(e) && !(lv > e)) return `sector ${sec} below its ${cfg.gateEma} EMA`;
  }
  if (cfg.chase.enabled && t - cfg.chase.lookbackDays >= 0) {
    const gain = (lv / (s.level[t - cfg.chase.lookbackDays] as number) - 1) * 100;
    if (gain >= cfg.chase.maxGainPct) return `sector ${sec} up ${gain.toFixed(1)}% in ${cfg.chase.lookbackDays} days (don't chase)`;
  }
  return null;
}
