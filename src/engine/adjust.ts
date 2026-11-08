/**
 * Split/bonus adjustment for the rolling price store. Ported from livermore/packages/data
 * (sources/nseCorpActions.ts parseCorpActionSubject, adjust/factors.ts price-gap check).
 *
 * On an ex-date, every earlier price is divided by the factor F and every earlier volume multiplied by F,
 * so the chart and moving averages stay continuous. F > 1 for splits/bonuses, < 1 for consolidations.
 */
import type { StockSeries } from "./types";

const AMT = String.raw`(?:rs\.?|re\.?|inr|₹)?\s*(\d+(?:\.\d+)?)\s*(?:\/-)?\s*(paise|ps\b)?`;
const FROM_TO_RE = new RegExp(String.raw`from\s+${AMT}.*?\b(?:to|into)\s+${AMT}`, "i");
const BONUS_RE = /bonus[^0-9]{0,40}?(\d+)\s*:\s*(\d+)/i;
const RATIO_RE = /(\d+)\s*:\s*(\d+)/;

const rupees = (v: string | undefined, paise: string | undefined) => (paise ? Number(v) / 100 : Number(v));
const clean = (x: number) => Math.round(x * 1e6) / 1e6;

function faceValues(s: string): [number, number] | null {
  const m = FROM_TO_RE.exec(s);
  if (!m) return null;
  const a = rupees(m[1], m[2]);
  const b = rupees(m[3], m[4]);
  return a > 0 && b > 0 ? [a, b] : null;
}

/**
 * Price factor from NSE's corporate-action subject, or null if the action does not change the share count.
 * "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share" → 5; "Bonus 1:1" → 2;
 * "Bonus 2:1" → 3; "Consolidation From Rs 1/- To Rs 10/-" → 0.1.
 */
export function corpActionFactor(subject: string): number | null {
  const s = subject.replace(/\s+/g, " ").trim();
  let split: number | null = null;
  let consolidation: number | null = null;
  let bonus: number | null = null;
  for (const part of s.split(/\s+and\s+|\s*\/\s*(?!-)|;\s*/i)) {
    const p = part.toLowerCase();
    if (/consolidat|reverse\s+split/.test(p)) {
      const fv = faceValues(part);
      if (fv) consolidation = clean(fv[0] / fv[1]);
    } else if (/split|sub-?\s?division/.test(p)) {
      const fv = faceValues(part);
      if (fv && fv[0] > fv[1]) split = clean(fv[0] / fv[1]);
      else if (fv && fv[0] < fv[1]) consolidation = clean(fv[0] / fv[1]);
      else {
        const r = RATIO_RE.exec(part);
        if (r && Number(r[1]) > 0 && Number(r[2]) > 0 && r[1] !== r[2]) {
          split = clean(Math.max(Number(r[1]), Number(r[2])) / Math.min(Number(r[1]), Number(r[2])));
        }
      }
    }
    if (/bonus/.test(p)) {
      const m = BONUS_RE.exec(part);
      if (m && Number(m[1]) > 0 && Number(m[2]) > 0) bonus = clean((Number(m[1]) + Number(m[2])) / Number(m[2]));
    }
  }
  if (consolidation !== null) return consolidation;
  if (split !== null && bonus !== null) return clean(split * bonus);
  return split ?? bonus;
}

/** Common share-count factors, for snapping an unexplained price gap. */
const SNAP = [1.5, 2, 2.5, 3, 4, 5, 6, 10, 20, 50, 100];

/**
 * Fallback when the corporate-actions API is unavailable: today's open and close both sit ≥ 1.9× below the last
 * stored close, and the ratio is within 4% of a common split/bonus factor → that factor. Otherwise null (a real
 * crash is left alone).
 */
export function gapFactor(lastClose: number, open: number, close: number): number | null {
  if (!(lastClose > 0 && open > 0 && close > 0)) return null;
  const r1 = lastClose / open;
  const r2 = lastClose / close;
  if (r1 < 1.9 || r2 < 1.7) return null;
  for (const f of SNAP) {
    if (Math.abs(r1 / f - 1) <= 0.04 || Math.abs(r2 / f - 1) <= 0.04) return f;
  }
  return null;
}

/** Divide prices before index `upTo` (exclusive) by F; multiply volumes by F. Mutates the series. */
export function applyFactor(s: StockSeries, factor: number, upTo: number): void {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  for (let k = 0; k < upTo && k < s.c.length; k++) {
    for (const key of ["o", "h", "l", "c"] as const) {
      const v = s[key][k];
      if (v !== null && v !== undefined) s[key][k] = r2(v / factor);
    }
    const vol = s.v[k];
    if (vol !== null && vol !== undefined) s.v[k] = Math.round(vol * factor);
  }
}
