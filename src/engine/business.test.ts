import { describe, expect, it } from "vitest";
import { bizTrend, bizView, chooseHistory, parseHistoryList, quarterEnds, quarterize, type BizQuarter } from "./business";
import { holdingsView, type HoldingsFile } from "./holdings";
import type { ScreenRow } from "./types";

const fig = (revenueCr: number | null, profitCr: number | null, eps: number | null = null) => ({ revenueCr, revenueKind: "operations" as const, profitCr, eps, months: 3 as const });
const q = (qe: string, rev: number | null, prof: number | null, eps: number | null = null, months: 3 | 6 = 3): BizQuarter => ({ ...fig(rev, prof, eps), months, qe, filed: qe });

describe("business history", () => {
  it("reads NSE's results list: XBRL quarters only, non-cumulative, latest revision per quarter and basis", () => {
    const row = (o: Record<string, unknown>) => ({ cumulative: "Non-cumulative", consolidated: "Consolidated", fromDate: "01-Oct-2024", toDate: "31-Dec-2024", broadCastDate: "04-Feb-2025 22:54:42", xbrl: "https://x/a.xml", ...o });
    const list = parseHistoryList([
      row({}),
      row({ broadCastDate: "10-Feb-2025 10:00:00", xbrl: "https://x/a-revised.xml" }),
      row({ consolidated: "Non-Consolidated", xbrl: "https://x/s.xml" }),
      row({ fromDate: "01-Apr-2024", xbrl: "https://x/nine-months.xml" }),
      row({ cumulative: "Cumulative", xbrl: "https://x/cum.xml" }),
      row({ toDate: "31-Dec-2016", fromDate: "01-Oct-2016", xbrl: "https://x/-" }),
    ]);
    expect(list.map((f) => [f.basis, f.xbrl])).toEqual([["Consolidated", "https://x/a-revised.xml"], ["Standalone", "https://x/s.xml"]]);
  });

  it("counts quarter ends back and picks the basis that covers more recent quarters", () => {
    expect(quarterEnds("2026-09-30", 5)).toEqual(["2026-09-30", "2026-06-30", "2026-03-31", "2025-12-31", "2025-09-30"]);
    const integrated = { data: ["2026-09-30", "2026-06-30", "2026-03-31"].flatMap((d) => {
      const [y, m, day] = d.split("-");
      const mon = { "09": "SEP", "06": "JUN", "03": "MAR" }[m!]!;
      const base = { type: "Integrated Filing- Financials", qe_Date: `${day}-${mon}-${y}`, broadcast_Date: `01-${mon}-${y} 10:00:00` };
      return d === "2026-09-30" ? [{ ...base, consolidated: "Standalone", xbrl: `s${d}.xml` }, { ...base, consolidated: "Consolidated", xbrl: `c${d}.xml` }] : [{ ...base, consolidated: "Standalone", xbrl: `s${d}.xml` }];
    }) };
    const pick = chooseHistory(integrated, []);
    expect(pick?.basis).toBe("Standalone");
    expect(pick?.filings.map((f) => f.qe)).toEqual(["2026-09-30", "2026-06-30", "2026-03-31"]);
    expect(chooseHistory(null, null)).toBeNull();
  });

  it("labels the business by the pre-registered definition", () => {
    expect(bizTrend(fig(110, 11), fig(100, 10))).toBe("growing");
    expect(bizTrend(fig(109, 20), fig(100, 10))).toBe("mixed");
    expect(bizTrend(fig(99, 20), fig(100, 10))).toBe("shrinking");
    expect(bizTrend(fig(120, 8.9), fig(100, 10))).toBe("shrinking");
    expect(bizTrend(fig(120, -1), fig(100, -5))).toBe("shrinking");
    expect(bizTrend(fig(120, 5), fig(100, -5))).toBe("mixed"); // back to profit: not "growing" without a profit before
    expect(bizTrend(fig(120, 5), null)).toBeNull();
  });

  it("turns a half-year into the quarter when the quarter before it is known", () => {
    const qs = quarterize([q("2026-06-30", 46, 9, 1.5), q("2026-09-30", 90, 15, 2.5, 6)]);
    expect(qs[1]).toMatchObject({ months: 3, revenueCr: 44, profitCr: 6, eps: 1 });
    expect(quarterize([q("2026-09-30", 90, 15, null, 6)])[0]?.months).toBe(6);
  });

  it("shows 8 quarters with growth, the latest trend and its streak, trailing growth and P/E", () => {
    const ends = quarterEnds("2026-09-30", 12).reverse();
    const h = { basis: "Consolidated" as const, checked: "", quarters: ends.map((e, i) => q(e, 100 * 1.04 ** i, 10 * 1.05 ** i, 1)) };
    const v = bizView(h, 80)!;
    expect(v.quarters).toHaveLength(8);
    expect(v.quarters[7]).toMatchObject({ label: "Q2 FY27", trend: "growing" });
    expect(v.quarters[7]!.revenueYoY).toBeCloseTo((1.04 ** 4 - 1) * 100, 0);
    expect(v.streak).toBe(8);
    expect(v.ttmEps).toBe(4);
    expect(v.pe).toBe(20);
    expect(v.ttmRevenueYoY).toBeCloseTo((1.04 ** 4 - 1) * 100, 0);
  });
});

describe("holdings review", () => {
  const h = (symbol: string, isin: string, qty: number, avg: number, etf = false) => ({ isin, symbol, name: symbol, qty, avg, ltp: avg, prevClose: avg, sector: null, mcap: null, etf });
  it("flags weak and deep stocks, small positions, sectors and business counts", () => {
    const file: HoldingsFile = { version: 1, fetchedAt: "2026-11-16T05:00:00Z", holdings: [h("AAA", "I1", 100, 100), h("BBB", "I2", 100, 100), h("CCC", "I3", 1, 100), h("GOLDBEES", "I4", 10, 100, true)] };
    const row = (isin: string, symbol: string, stage: number, rs: number, pctFromHigh: number, industry: string) => ({ isin, symbol, stage, rs, pctFromHigh, industry, tags: [], close: 100 }) as unknown as ScreenRow;
    const rows = [row("I1", "AAA", 4, 20, 40, "Power"), row("I2", "BBB", 2, 80, 5, "Power"), row("I3", "CCC", 4, 50, 10, "Banks")];
    const ends = quarterEnds("2026-09-30", 5).reverse();
    const business = { version: 1 as const, missing: {}, parsed: {}, bySymbol: { AAA: { basis: "Standalone" as const, checked: "", quarters: ends.map((e, i) => q(e, i === 4 ? 150 : 100, i === 4 ? 20 : 10)) } } };
    const v = holdingsView(file, { rows, news: {}, live: null, closes: null, syncedToday: true, business });
    const a = v.rows.find((r) => r.symbol === "AAA")!;
    expect(a).toMatchObject({ weak: true, deep: true, sectorName: "Power" });
    expect(a.business?.trend).toBe("growing");
    expect(v.rows.find((r) => r.symbol === "BBB")).toMatchObject({ weak: false, deep: false, business: null });
    expect(v.rows.find((r) => r.symbol === "GOLDBEES")).toMatchObject({ sectorName: "ETFs", business: null });
    const rv = v.summary.review;
    expect(rv.small.symbols).toEqual(["CCC"]);
    expect(rv.sectors[0]).toMatchObject({ sector: "Power", n: 2 });
    expect(rv.weak.n).toBe(1);
    expect(rv.business).toEqual({ growing: 1, mixed: 0, shrinking: 0, unknown: 2 });
  });
});
