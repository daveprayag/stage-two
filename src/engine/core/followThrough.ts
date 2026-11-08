/**
 * Breakout follow-through gauge (rulebook v2). RULEBOOK "Market regime": the first sign of deterioration is no
 * follow-through — breakouts reverse the same day, flags fail (w1sbooFlgLY @70m, mwFLohDp8Lc @1–2m, BFSID23Yt9s,
 * 0cCAK144s1g); his regime read is the feedback from his watchlist and open trades (v2nFQiYX2P0, PfeoiKLTNPo).
 *
 * Every emitted signal is paper-tracked whether or not it is traded:
 *  - triggered: the next bar's high ≥ trigger (and the open ≤ trigger × (1 + gap skip), i.e. it would have filled);
 *  - failed:    within `horizonBars` bars of the trigger day (incl.), a close below the trigger or a low ≤ stop.
 * Health on day t = failed / triggered over signals whose evaluation window ended within the last `lookbackDays`
 * trading days. Everything used is ≤ t. Pure; the simulator and the live scanner feed it bars as they arrive.
 */
import type { FollowThroughConfig } from './config.js';
import type { Bar, ISODate } from './types.js';

export interface PaperSignal {
  isin: string;
  date: ISODate;
  trigger: number;
  stop: number;
}

interface Tracked {
  sig: PaperSignal;
  /** Bars seen after the signal date (0 = waiting for the trigger day). */
  seen: number;
  triggered: boolean;
  failed: boolean;
  done: boolean;
}

export interface Outcome {
  /** Calendar index of the day the outcome became known. */
  t: number;
  failed: boolean;
}

export class FollowThroughTracker {
  private open: Tracked[] = [];
  private readonly outcomes: Outcome[] = [];

  constructor(private readonly cfg: FollowThroughConfig, private readonly gapSkipPct: number) {}

  /** Register signals emitted at the close of the current day. */
  add(signals: readonly PaperSignal[]): void {
    for (const sig of signals) this.open.push({ sig, seen: 0, triggered: false, failed: false, done: false });
  }

  /**
   * Feed day t's bars (call before adding day t's new signals). `barOf(isin)` returns that instrument's bar for day t,
   * or undefined if it did not trade.
   */
  step(t: number, barOf: (isin: string) => Bar | undefined): void {
    const keep: Tracked[] = [];
    for (const tr of this.open) {
      const b = barOf(tr.sig.isin);
      if (!b) {
        keep.push(tr);
        continue;
      }
      tr.seen++;
      if (tr.seen === 1) {
        const wouldFill = b.high >= tr.sig.trigger && b.open <= tr.sig.trigger * (1 + this.gapSkipPct / 100);
        if (!wouldFill) continue; // never triggered: dropped, not an outcome
        tr.triggered = true;
      }
      if (b.low <= tr.sig.stop || (this.cfg.failOn === 'closeBelowTrigger' && b.close < tr.sig.trigger)) tr.failed = true;
      if (tr.failed || tr.seen >= this.cfg.horizonBars) {
        this.outcomes.push({ t, failed: tr.failed });
        continue;
      }
      keep.push(tr);
    }
    this.open = keep;
  }

  /** Failed share of outcomes known in (t − lookbackDays, t], and how many there were. */
  health(t: number): { failRate: number; n: number } {
    let n = 0;
    let failed = 0;
    for (let k = this.outcomes.length - 1; k >= 0; k--) {
      const o = this.outcomes[k] as Outcome;
      if (o.t <= t - this.cfg.lookbackDays) break;
      if (o.t > t) continue;
      n++;
      if (o.failed) failed++;
    }
    return { failRate: n ? failed / n : 0, n };
  }

  /** True when breakouts are failing: enough outcomes and a fail rate above the threshold. */
  poor(t: number): boolean {
    const h = this.health(t);
    return this.cfg.enabled && h.n >= this.cfg.minOutcomes && h.failRate > this.cfg.maxFailRate;
  }
}
