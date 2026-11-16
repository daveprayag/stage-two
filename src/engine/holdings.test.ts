import { describe, expect, it } from "vitest";
import { holdingsView, jwtExpiry, parsePaytmHoldings, type HoldingsFile } from "./holdings";
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
