/**
 * Systematic (non-Ankur) strategies on the same engine. Sources and exact rules: docs/research/external_strategies.md.
 *
 * - rsi2: Connors RSI(2) pullback (StockCharts ChartSchool "RSI(2)"): long only above the 200-day SMA, buy after RSI(2)
 *   closes ≤ entryRsiMax, exit on a close above the 5-day SMA. Daily-bar version: decide at the close, fill at the next
 *   open (Connors buys just before the close; next-open is the honest end-of-day equivalent). Connors uses no stop; we
 *   add a wide catastrophe stop and a time stop so R and risk are defined.
 * - hi52: George & Hwang (2004) 52-week-high momentum, long side only: at each month-end rank liquid stocks by
 *   close / highest high of the last 252 bars, hold the top `holdN` equally weighted, sell holdings that fall out of the
 *   top `keepRank` (a buffer to cut turnover). R uses a nominal stop for reporting; no stop is traded unless set.
 *
 * Pure: everything at bar i uses data ≤ i. Calendar knowledge (is tomorrow a new month?) is known in advance.
 */
import type { StrategyConfig } from './config.js';
import type { Features } from './indicators.js';
import { maxOf, sma } from './indicators.js';
import type { ExitAction, ExitReason, PositionState } from './manage.js';
import type { InstrumentContext, Signal } from './setups/common.js';
import { ceilTick, floorTick } from './ticks.js';
import type { ISODate } from './types.js';

export type SystematicName = 'rsi2' | 'hi52';

/** Wilder RSI. NaN until `period` changes exist. */
export function rsi(values: ArrayLike<number>, period: number): Float64Array {
  const n = values.length;
  const out = new Float64Array(n).fill(Number.NaN);
  if (n <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = (values[i] as number) - (values[i - 1] as number);
    if (d > 0) gain += d;
    else loss -= d;
  }
  let ag = gain / period;
  let al = loss / period;
  out[period] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  for (let i = period + 1; i < n; i++) {
    const d = (values[i] as number) - (values[i - 1] as number);
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}

/** Per-instrument extras for the systematic strategies (computed once). */
export interface SystematicFeatures {
  rsi2: Float64Array;
  sma5: Float64Array;
  sma200: Float64Array;
}

export function systematicFeatures(f: Features): SystematicFeatures {
  return { rsi2: rsi(f.close, 2), sma5: sma(f.close, 5), sma200: sma(f.close, 200) };
}

/** Lean liquidity/eligibility check shared by the systematic strategies (EQ, price, turnover, price band). */
export function systematicEligible(f: Features, i: number, cfg: StrategyConfig, minClose: number, minTurnover50Cr: number): boolean {
  const bar = f.bars[i];
  if (!bar || !cfg.universe.series.includes(bar.series)) return false;
  if (typeof bar.priceBand === 'number' && cfg.universe.excludePriceBands.includes(bar.priceBand)) return false;
  return (f.close[i] as number) > minClose && (f.turnover50Cr[i] as number) >= minTurnover50Cr;
}

/** RSI(2) pullback signal at bar i (entry at the next open). */
export function detectRsi2(ctx: InstrumentContext, sx: SystematicFeatures, i: number, cfg: StrategyConfig): Signal | null {
  const r = cfg.rsi2;
  const f = ctx.f;
  if (!systematicEligible(f, i, cfg, r.minClose, r.minTurnover50Cr)) return null;
  const c = f.close[i] as number;
  if (!(c > (sx.sma200[i] as number))) return null;
  if (!((sx.rsi2[i] as number) <= r.entryRsiMax)) return null;
  const bar = f.bars[i];
  if (!bar) return null;
  const stop = floorTick(c * (1 - r.catastropheStopPct / 100), cfg.entry.tick);
  return {
    isin: ctx.isin, symbol: ctx.symbol, date: bar.date, setup: 'rsi2', anchorDate: bar.date,
    trigger: c, limit: ceilTick(c * (1 + r.maxGapUpPct / 100), cfg.entry.tick), stop,
    stopPct: r.catastropheStopPct, score: -(sx.rsi2[i] as number), entry: 'open',
    reasons: [`RSI(2) ${(sx.rsi2[i] as number).toFixed(1)} ≤ ${r.entryRsiMax}, close above SMA200`],
    meta: { rsi2: sx.rsi2[i] as number },
  };
}

/** 52-week-high nearness: close / highest high of the last `lookbackBars` bars (incl. today). NaN without enough history. */
export function hi52Score(f: Features, i: number, lookbackBars: number): number {
  if (i < lookbackBars - 1) return Number.NaN;
  return (f.close[i] as number) / maxOf(f.high, i - lookbackBars + 1, i);
}

/** True when `date` is the last trading day of its month (the next calendar day trades in a new month). */
export function isMonthEnd(calendar: readonly ISODate[], t: number): boolean {
  const next = calendar[t + 1];
  return next !== undefined && next.slice(0, 7) !== (calendar[t] as string).slice(0, 7);
}

/** Rank candidates (higher score first, ties by ISIN) → the buy list (top holdN) and the keep set (top keepRank). */
export function selectHi52(cands: readonly { isin: string; score: number }[], cfg: StrategyConfig): { ranked: string[]; keep: Set<string> } {
  const ranked = [...cands].filter((c) => Number.isFinite(c.score)).sort((a, b) => b.score - a.score || a.isin.localeCompare(b.isin)).map((c) => c.isin);
  return { ranked, keep: new Set(ranked.slice(0, cfg.hi52.keepRank)) };
}

/** A hi52 entry order for the next open (equal weight; nominal stop for R accounting). */
export function hi52Signal(ctx: InstrumentContext, i: number, score: number, cfg: StrategyConfig): Signal | null {
  const bar = ctx.f.bars[i];
  if (!bar) return null;
  const c = ctx.f.close[i] as number;
  const h = cfg.hi52;
  return {
    isin: ctx.isin, symbol: ctx.symbol, date: bar.date, setup: 'hi52', anchorDate: bar.date,
    trigger: c, limit: ceilTick(c * (1 + h.maxGapUpPct / 100), cfg.entry.tick),
    stop: floorTick(c * (1 - h.nominalStopPct / 100), cfg.entry.tick), stopPct: h.nominalStopPct,
    score, entry: 'open', reasons: [`close/52w high ${score.toFixed(3)}`], meta: { score },
  };
}

/**
 * Manage a systematic position on bar i. Order: pending exit at the open; hard stop (gap → open, else intraday);
 * then at the close: rsi2 exit on close > SMA5, time stop after maxHoldBars. hi52 exits are set by the rebalance.
 */
export function manageSystematic(
  pos: PositionState,
  f: Features,
  sx: SystematicFeatures,
  i: number,
  cfg: StrategyConfig,
  isEntryDay: boolean,
): { state: PositionState; actions: ExitAction[] } {
  const s: PositionState = { ...pos };
  const actions: ExitAction[] = [];
  if (s.closed) return { state: s, actions };
  const o = f.open[i] as number;
  const l = f.low[i] as number;
  const h = f.high[i] as number;
  const c = f.close[i] as number;
  const closeAll = (price: number, reason: ExitReason, when: ExitAction['when']) => {
    actions.push({ fraction: 1, price, reason, when });
    s.closed = true;
    s.pendingExit = null;
    return { state: s, actions };
  };
  if (!isEntryDay) {
    s.barsHeld += 1;
    if (s.pendingExit !== null) return closeAll(o, s.pendingExit, 'open');
    if (s.hardStop && o <= s.stop) return closeAll(o, 'stopGap', 'open');
  }
  if (s.hardStop && l <= s.stop) return closeAll(s.stop, isEntryDay ? 'entryDayStop' : 'stop', 'intraday');
  s.maxHigh = Math.max(s.maxHigh, h);
  s.minLow = Math.min(s.minLow, l);
  if (s.setup === 'rsi2') {
    if (c > (sx.sma5[i] as number)) s.pendingExit = 'signalExit';
    else if (s.barsHeld >= cfg.rsi2.maxHoldBars) s.pendingExit = 'timeStop';
  }
  return { state: s, actions };
}
