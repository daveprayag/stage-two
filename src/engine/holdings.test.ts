import { describe, expect, it } from "vitest";
import { addMonths, buySession, holdingsView, jwtExpiry, parsePaytmHoldings, updateLots, type HoldingsFile } from "./holdings";
import type { ScreenRow } from "./types";

// Shape of Paytm Money's /holdings/v1/get-user-holdings-data answer (fields as its API returns them: strings).
const body = {
  data: {
    results: [
      { nse_symbol: "SAIL", bse_symbol: "SAIL", isin_code: "INE114A01011", quantity: "100", cost_price: "120", last_traded_price: "138", pc: 140, display_name: "Steel Authority Of India", sector: "Steel", mcap_type: "Large Cap" },
      { nse_symbol: "NIFTYBEES", isin_code: "INF204KB14I2", quantity: "10", cost_price: "250", last_traded_price: "280", pc: 279, display_name: "Nippon India ETF Nifty 50 BeES" },
      { nse_symbol: "GONE", isin_code: "INE000X01011", quantity: "0", cost_price: "10" },
      { nse_symbol: null, bse_symbol: "BSEONLY", isin_code: "INE000Y01011", quantity: "5", cost_price: "40", last_traded_price: "50" },
    ],
  },
  meta: { displayMessage: null },
};

describe("holdings", () => {
  it("parses Paytm Money's holdings, skipping zero quantities, falling back to the BSE symbol", () => {
    const h = parsePaytmHoldings(body);
    expect(h.map((x) => x.symbol)).toEqual(["SAIL", "NIFTYBEES", "BSEONLY"]);
    expect(h[0]).toMatchObject({ isin: "INE114A01011", qty: 100, avg: 120, ltp: 138, prevClose: 140, etf: false, mcap: "Large Cap" });
    expect(h[1]?.etf).toBe(true);
    expect(parsePaytmHoldings({ data: [] })).toEqual([]);
    expect(() => parsePaytmHoldings({ error: "x" })).toThrow();
  });

  it("prices with live NSE first, then today's Paytm Money price, then the last close; totals and weights", () => {
    const file: HoldingsFile = { version: 1, fetchedAt: "2026-11-16T05:00:00Z", holdings: parsePaytmHoldings(body).slice(0, 2) };
    const rows = [{ isin: "INE114A01011", symbol: "SAIL", tags: ["momentum"], stage: 2, rs: 91, phase: "early", resultsReaction: null } as unknown as ScreenRow];
    const live = { q: { SAIL: [150, 2, 1000] as [number, number, number] } };
    const v = holdingsView(file, { rows, news: {}, live, closes: { NIFTYBEES: ["INF204KB14I2", 275] }, syncedToday: true });
    const [sail, bees] = [v.rows.find((r) => r.symbol === "SAIL")!, v.rows.find((r) => r.symbol === "NIFTYBEES")!];
    expect(sail).toMatchObject({ price: 150, priceFrom: "nse", value: 15000, invested: 12000, pnl: 3000, momentum: true, rs: 91 });
    expect(sail.pnlPct).toBeCloseTo(25);
    expect(sail.dayPnl).toBeCloseTo(15000 - 15000 / 1.02);
    expect(bees).toMatchObject({ price: 280, priceFrom: "paytm", value: 2800, momentum: false, inScreen: false });
    expect(bees.dayPct).toBeCloseTo((280 / 279 - 1) * 100);
    expect(v.rows[0]?.symbol).toBe("SAIL"); // biggest first
    expect(v.summary).toMatchObject({ n: 2, value: 17800, invested: 14500, pnl: 3300, leaders: 1 });
    expect((sail.weight ?? 0) + (bees.weight ?? 0)).toBeCloseTo(100);

    // Synced on an earlier day and no live price: last close, and no day change (it would be an old day's).
    const old = holdingsView(file, { rows, news: {}, live: null, closes: { NIFTYBEES: ["INF204KB14I2", 275] }, syncedToday: false });
    expect(old.rows.find((r) => r.symbol === "NIFTYBEES")).toMatchObject({ price: 275, priceFrom: "close", dayPct: null });
    expect(old.summary.dayPnl).toBeNull();
  });

  it("flags red-flag news and a bad results reaction", () => {
    const file: HoldingsFile = { version: 1, fetchedAt: "2026-11-16T05:00:00Z", holdings: parsePaytmHoldings(body).slice(0, 1) };
    const rows = [{ isin: "INE114A01011", symbol: "SAIL", tags: [], stage: 3, rs: 40, phase: null, resultsReaction: { kind: "breakdown" } } as unknown as ScreenRow];
    const news = { SAIL: { ai: { sentiment: "neutral", redFlags: ["pledge"] } } } as never;
    const [r] = holdingsView(file, { rows, news, live: null, closes: null, syncedToday: true }).rows;
    expect(r).toMatchObject({ redFlag: true, resultsDrop: true, momentum: false, stage: 3 });
  });

  it("reads a JWT's expiry without trusting it for anything else", () => {
    const payload = btoa(JSON.stringify({ exp: 1_800_000_000 })).replace(/=+$/, "");
    expect(jwtExpiry(`h.${payload}.s`)).toBe(new Date(1_800_000_000_000).toISOString());
    expect(jwtExpiry("not-a-jwt")).toBeNull();
    expect(jwtExpiry("a.%%%.b")).toBeNull();
  });
});

describe("lots", () => {
  const h = (symbol: string, isin: string, qty: number, avg: number) => ({ isin, symbol, name: symbol, qty, avg, ltp: avg, prevClose: avg, sector: null, mcap: null, etf: false });
  const file = (fetchedAt: string, holdings: ReturnType<typeof h>[]): HoldingsFile => ({ version: 1, fetchedAt, holdings });
  const rows = [{ isin: "I1", symbol: "AAA", low10: 90 } as unknown as ScreenRow, { isin: "I2", symbol: "BBB", low10: 45 } as unknown as ScreenRow];

  it("marks what was held before tracking as undated, then dates new buys with the stop from the lists before them", () => {
    // Monday 16 Nov 2026, 11:00 IST; lists from Friday 13 Nov.
    const first = updateLots(null, file("2026-11-16T05:30:00Z", [h("AAA", "I1", 100, 100)]), { rows, asOf: "2026-11-13" });
    expect(first.byIsin.I1?.lots).toEqual([{ qty: 100, price: 100, date: null, after: null, stop: null, stopExact: false }]);
    // Tuesday 11:00 IST: 50 more AAA at 112 (avg 104), and a new stock BBB; lists from Monday.
    const next = updateLots(first, file("2026-11-17T05:30:00Z", [h("AAA", "I1", 150, 104), h("BBB", "I2", 20, 50)]), { rows, asOf: "2026-11-16" });
    const added = next.byIsin.I1?.lots[1];
    expect(added).toMatchObject({ qty: 50, date: "2026-11-17", stop: 90, stopExact: true, after: "2026-11-16T05:30:00Z" });
    expect(added?.price).toBeCloseTo(112);
    expect(next.byIsin.I2?.lots).toEqual([expect.objectContaining({ qty: 20, price: 50, date: "2026-11-17", stop: 45, stopExact: true })]);
  });

  it("sells the oldest shares first, keeps lots through a bonus, and ignores an empty read", () => {
    const a = updateLots(null, file("2026-11-16T05:30:00Z", [h("AAA", "I1", 100, 100)]), { rows, asOf: "2026-11-13" });
    const b = updateLots(a, file("2026-11-17T05:30:00Z", [h("AAA", "I1", 150, 104)]), { rows, asOf: "2026-11-16" });
    const sold = updateLots(b, file("2026-11-18T05:30:00Z", [h("AAA", "I1", 120, 104)]), { rows, asOf: "2026-11-17" });
    expect(sold.byIsin.I1?.lots.map((l) => [l.date, l.qty])).toEqual([[null, 70], ["2026-11-17", 50]]);
    const bonus = updateLots(sold, file("2026-11-19T05:30:00Z", [h("AAA", "I1", 240, 52)]), { rows, asOf: "2026-11-18" });
    expect(bonus.byIsin.I1?.lots.map((l) => [l.date, l.qty, l.stop])).toEqual([[null, 140, null], ["2026-11-17", 100, 45]]);
    expect(updateLots(bonus, file("2026-11-20T05:30:00Z", []), { rows, asOf: "2026-11-19" })).toBe(bonus);
    // A small top-up is a buy, not a split.
    const top = updateLots(a, file("2026-11-17T05:30:00Z", [h("AAA", "I1", 105, 100.05)]), { rows, asOf: "2026-11-16" });
    expect(top.byIsin.I1?.lots).toHaveLength(2);
  });

  it("dates a buy to today once the market has opened, else to the last close; holds 6 months", () => {
    expect(buySession("2026-11-17T05:30:00Z", "2026-11-16")).toBe("2026-11-17"); // Tue 11:00 IST
    expect(buySession("2026-11-17T02:00:00Z", "2026-11-16")).toBe("2026-11-16"); // Tue 07:30 IST, before the open
    expect(buySession("2026-11-21T06:00:00Z", "2026-11-20")).toBe("2026-11-20"); // Saturday
    expect(addMonths("2026-11-17", 6)).toBe("2027-05-17");
  });
});
