/**
 * Eligibility on day i. RULEBOOK "Universe and exclusions" and "Do-not-buy filters".
 * The day-move cap (already up ≥ 8% on the entry day, w1sbooFlgLY) is applied at the fill by the simulator.
 */
import type { StrategyConfig } from './config.js';
import type { Features } from './indicators.js';

/** Returns true if bar i is in the tradable universe. Pushes reasons into `trace` (and checks everything) when given. */
export function checkUniverse(f: Features, i: number, cfg: StrategyConfig, trace?: string[]): boolean {
  const u = cfg.universe;
  const bar = f.bars[i];
  if (!bar) return false;
  let ok = true;
  const fail = (msg: string): void => {
    ok = false;
    trace?.push(`universe: ${msg}`);
  };
  // Excluded categories: SME (SM/ST) and trade-to-trade (BE) — EXACT (CcVEU0M7uPQ, jfr-kMHSEI4).
  if (!u.series.includes(bar.series)) {
    if (!trace) return false;
    fail(`series ${bar.series} not in [${u.series.join(',')}]`);
  }
  // Price band: no 5%-band stocks (and 2%) — EXACT (CcVEU0M7uPQ, ahFVnEzFcag, WABVcgG2MSE).
  const band = bar.priceBand;
  if (typeof band === 'number' && u.excludePriceBands.includes(band)) {
    if (!trace) return false;
    fail(`price band ${band}%`);
  }
  const c = f.close[i] as number;
  // Price > ₹30 — EXACT (all scanners).
  if (!(c > u.minClose)) {
    if (!trace) return false;
    fail(`close ${c} ≤ ${u.minClose}`);
  }
  // Liquidity: SMA50(vol) × close ≥ ₹5 Cr — EXACT (wnhGCYBk4Gg).
  const t = f.turnover50Cr[i] as number;
  if (!(t >= u.minTurnover50Cr)) {
    if (!trace) return false;
    fail(`turnover50 ${fmt(t)} Cr < ${u.minTurnover50Cr}`);
  }
  // Not extended: close ≤ 1.25 × SMA50 — EXACT (flag and momentum scans).
  const s = f.sma50[i] as number;
  if (!(c <= u.maxCloseToSma50 * s)) {
    if (!trace) return false;
    fail(`extended: close/SMA50 ${fmt(c / s)} > ${u.maxCloseToSma50}`);
  }
  // Trend: below the 50 EMA = not trending — EXACT (wnhGCYBk4Gg).
  if (u.requireCloseAboveEma50) {
    const e50 = f.ema50[i] as number;
    if (!(c > e50)) {
      if (!trace) return false;
      fail(`close ${c} ≤ EMA50 ${fmt(e50)}`);
    }
  }
  // Volatility: ADR ~3–4%+ — APPROX, off by default (wnhGCYBk4Gg).
  if (u.minAdrPct !== null) {
    const a = f.adr20[i] as number;
    if (!(a >= u.minAdrPct)) {
      if (!trace) return false;
      fail(`ADR ${fmt(a)}% < ${u.minAdrPct}`);
    }
  }
  // Do-not-buy: up 60–70% in the last 1–2 months — EXACT idea, APPROX window (jMhKXuR0kyk).
  if (u.maxRunUpPct !== null) {
    const ll = f.lowestLowRunUp[i] as number;
    const runUp = (c / ll - 1) * 100;
    if (!(runUp <= u.maxRunUpPct)) {
      if (!trace) return false;
      fail(`run-up ${fmt(runUp)}% from ${u.runUpLookbackBars}-bar low > ${u.maxRunUpPct}`);
    }
  }
  return ok;
}

export function fmt(v: number, digits = 2): string {
  return Number.isFinite(v) ? v.toFixed(digits) : String(v);
}
