import { describe, expect, it } from "vitest";
import { basketGrowth, buildHoldingsHistory, growth, historyKey } from "./portfolio";
import type { StockSeries } from "./types";

const series = (isin: string, symbol: string, c: (number | null)[]) => ({ isin, symbol, c }) as unknown as StockSeries;

describe("holdings history", () => {
  it("keeps the last sessions of held symbols, found by ISIN or symbol", () => {
    const head = { asOf: "2026-11-16", dates: ["d1", "d2", "d3"], indices: { "NIFTY 500": [10, 11, 12] } };
    const h = buildHoldingsHistory(head, [series("I1", "AAA", [1, 2, 3]), series("I2", "OLD", [4, 5, 6])], [{ isin: "I1", symbol: "X" }, { isin: "I9", symbol: "OLD" }, { isin: "I8", symbol: "NONE" }], 2);
    expect(h.dates).toEqual(["d2", "d3"]);
    expect(h.nifty500).toEqual([11, 12]);
    expect(h.closes).toEqual({ X: [2, 3], OLD: [5, 6] });
    expect(historyKey("2026-11-16", ["B", "A"])).toBe("2026-11-16|A,B");
  });

  it("chains value-weighted daily returns; a later listing joins without a jump", () => {
    const h = { dates: ["a", "b", "c"], closes: { A: [100, 110, 110], B: [null, 50, 100] } };
    const g = basketGrowth(h, { A: 1, B: 1 }, 0);
    expect(g[1]).toBeCloseTo(1.1); // only A traded both days
    // day c: A 110→110, B 50→100: (110 + 100) / (110 + 50)
    expect(g[2]).toBeCloseTo(1.1 * (210 / 160));
    const live = basketGrowth(h, { A: 2, B: 0 }, 1, { A: 121 });
    expect(live).toHaveLength(3);
    expect(live[2]).toBeCloseTo(1.1);
  });

  it("turns an index into growth from its first close", () => {
    expect(growth([null, 50, 75], 0)).toEqual([null, 1, 1.5]);
    expect(growth([100, 120], 1, 132)).toEqual([1, 1.1]);
  });
});
