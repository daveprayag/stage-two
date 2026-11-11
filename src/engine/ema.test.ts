import { describe, expect, it } from "vitest";
import { applyFactor } from "./adjust";
import { compact, emaArr, emaLines, EMA_PERIODS, rollSeed } from "./series";
import type { PriceStore, StockSeries } from "./types";
import { appendSession } from "./update";

/** A deterministic wandering price series. */
function prices(n: number, start = 100): number[] {
  const out: number[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p *= 1 + 0.02 * Math.sin(i * 0.37) + 0.012 * Math.cos(i * 1.7) + 0.001;
    out.push(Math.round(p * 100) / 100);
  }
  return out;
}

const day = (k: number) => new Date(Date.UTC(2024, 0, 1) + k * 86_400_000).toISOString().slice(0, 10);

describe("emaArr", () => {
  it("seeds with the simple average of the first N closes, as TradingView does", () => {
    const e = emaArr([1, 2, 3, 4, 5], 3);
    expect(e[1]).toBeNaN();
    expect(e[2]).toBeCloseTo(2);
    expect(e[3]).toBeCloseTo(0.5 * 4 + 0.5 * 2); // α = 2/(3+1) = 0.5
    expect(e[4]).toBeCloseTo(0.5 * 5 + 0.5 * 3);
  });

  it("continued from a seed, a window's EMA equals the full-history EMA", () => {
    const all = prices(700);
    for (const p of EMA_PERIODS) {
      const full = emaArr(all, p);
      const win = emaArr(all.slice(400), p, full[399]);
      for (let j = 0; j < win.length; j++) expect(win[j]).toBeCloseTo(full[400 + j] as number, 8);
    }
  });

  it("without a seed, 300 sessions leave a 200-day EMA visibly off (why the store keeps seeds)", () => {
    // A steady uptrend (+0.3% a day): the window-only EMA starts from a stale simple average and is still ~0.6% low,
    // enough to flip "above the 200-day" for stocks near it.
    const all = Array.from({ length: 700 }, (_, i) => 100 * 1.003 ** i);
    const full = emaArr(all, 200);
    const windowOnly = emaArr(all.slice(400), 200);
    expect(1 - (windowOnly[299] as number) / (full[699] as number)).toBeGreaterThan(0.005);
  });
});

describe("rollSeed", () => {
  it("steps a seed through the dropped closes, skipping days without a trade", () => {
    const all = prices(500);
    const full = emaArr(all, 50);
    const slots: (number | null)[] = [...all.slice(300, 303), null, ...all.slice(303)];
    const seed = rollSeed([full[299] as number, null, null], slots, 4);
    expect(seed?.[0]).toBeCloseTo(full[302] as number, 8);
  });

  it("without a seed, backs out the one that keeps a recent listing's line unchanged", () => {
    const all = prices(260);
    const before = emaArr(all, 50);
    const seed = rollSeed(null, all, 10);
    const after = emaArr(all.slice(10), 50, seed?.[0]);
    for (let j = 49; j < all.length; j++) expect(after[j - 10]).toBeCloseTo(before[j] as number, 6);
    // 200-day: its line only starts at bar 199, so the seed is stepped back from there; the line is unchanged.
    const before200 = emaArr(all, 200);
    const after200 = emaArr(all.slice(10), 200, seed?.[2]);
    for (let j = 199; j < all.length; j++) expect(after200[j - 10]).toBeCloseTo(before200[j] as number, 6);
  });
});

describe("store EMAs across sessions", () => {
  it("stay the full-history EMA as the window moves and through a split", () => {
    const all = prices(700);
    const WINDOW = 300;
    const startAt = 399; // the stored window holds closes 400..699 (seed = EMA at 399)
    const store: PriceStore = { version: 1, asOf: day(699), dates: [], indices: {}, stocks: {} };
    const s: StockSeries = { isin: "INE1", symbol: "AAA", name: "AAA LTD", series: "EQ", industry: null, band: null, listed: null, o: [], h: [], l: [], c: [], v: [] };
    for (let k = startAt + 1; k < 700; k++) {
      store.dates.push(day(k));
      for (const f of ["o", "h", "l", "c"] as const) s[f].push(all[k] as number);
      s.v.push(1000);
    }
    s.ema0 = EMA_PERIODS.map((p) => emaArr(all, p)[startAt] as number);
    store.stocks[s.isin] = s;

    const next = Math.round((all[699] as number) * 101) / 100; // +1%: no split-like gap
    appendSession(store, { date: day(700), rows: [{ isin: "INE1", symbol: "AAA", series: "EQ", name: "AAA LTD", open: next, high: next, low: next, close: next, prevClose: all[699] as number, volume: 1000 }], indexCloses: new Map() }, WINDOW);
    const full = [...all, next];
    const kept = store.stocks["INE1"]!;
    const lines = emaLines(compact(store, kept).close, kept.ema0);
    expect(lines.ma200.length).toBe(WINDOW);
    expect(lines.ma200[WINDOW - 1]).toBeCloseTo(emaArr(full, 200)[700] as number, 6);
    expect(lines.ma50[WINDOW - 1]).toBeCloseTo(emaArr(full, 50)[700] as number, 6);

    // A 2:1 split halves the history and the seeds alike: the EMA halves too.
    const before = emaLines(compact(store, kept).close, kept.ema0).ma150[WINDOW - 1] as number;
    applyFactor(kept, 2, WINDOW);
    const afterSplit = emaLines(compact(store, kept).close, kept.ema0).ma150[WINDOW - 1] as number;
    expect(afterSplit).toBeCloseTo(before / 2, 1);
  });
});
