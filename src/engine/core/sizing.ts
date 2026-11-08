/**
 * Position sizing. RULEBOOK "Position sizing": risk 0.5% of capital per trade (v2nFQiYX2P0, w1sbooFlgLY),
 * capped at 15% of capital per position, 5% in a weak market (w1sbooFlgLY ~80m).
 * shares = floor(min(riskPct% × capital / (entry − stop), capPct% × capital / entry)); 0 if < 1 share.
 * Capital is FIXED (no compounding) per CLAUDE.md.
 */
import type { SizingConfig } from './config.js';
import type { Regime } from './regime.js';

export interface SizeInput {
  capital: number;
  entry: number;
  stop: number;
  regime: Regime;
  sizing: SizingConfig;
}

export function positionCapPctFor(regime: Regime, sizing: SizingConfig): number {
  if (regime === 'healthy') return sizing.positionCapPct.healthy;
  if (regime === 'weak') return sizing.positionCapPct.weak;
  return 0;
}

export function positionSize(p: SizeInput): number {
  const riskPerShare = p.entry - p.stop;
  if (!(riskPerShare > 0) || !(p.entry > 0) || !(p.capital > 0)) return 0;
  const capPct = positionCapPctFor(p.regime, p.sizing);
  if (capPct <= 0) return 0;
  const byRisk = ((p.sizing.riskPct / 100) * p.capital) / riskPerShare;
  const byCap = ((capPct / 100) * p.capital) / p.entry;
  const shares = Math.floor(Math.min(byRisk, byCap) + 1e-9);
  return shares >= 1 ? shares : 0;
}
