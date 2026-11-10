import { describe, expect, it } from "vitest";
import { liveIsFresh } from "./clock";
import { addItem, historyFor, removeItem, watchRow, watchSummary, type WatchItem } from "./watchlist";

const item = (over: Partial<WatchItem> = {}): WatchItem => ({
  symbol: "AAA", isin: "INE000A01011", name: "AAA LTD", addedAt: "2026-11-09T10:00:00Z", session: "2026-11-06",
  price: 100, nifty: 1000, starred: true, starCount: 5, momentum: true, rs: 95, stage: 2, phase: "early", ...over,
});

describe("watchlist", () => {
  it("counts only sessions after the one it was added in", () => {
    const h = historyFor("2026-11-06", ["2026-11-05", "2026-11-06", "2026-11-09", "2026-11-10"], {
      h: [150, 140, 112, 108], l: [90, 95, 99, 93], c: [140, 100, 110, 95],
    });
    expect(h).toEqual({ sessions: 2, high: 112, low: 93, close: 95 });
  });

  it("uses the live price when there is one, and compares with the NIFTY 500", () => {
    const r = watchRow(item(), { sessions: 2, high: 112, low: 93, close: 95 }, { price: 120, live: true }, 1010, { starred: false, count: 4 });
    expect(r.now).toBe(120);
    expect(r.ret).toBeCloseTo(20);
    expect(r.best).toBeCloseTo(20); // live 120 beats the daily high 112
    expect(r.worst).toBeCloseTo(-7);
    expect(r.vsNifty).toBeCloseTo(19);
    expect(r.starredNow).toBe(false);
  });

  it("falls back to the last close without a live price", () => {
    const r = watchRow(item(), { sessions: 1, high: 101, low: 90, close: 91 }, { price: null, live: false }, null, { starred: true, count: 5 });
    expect(r.now).toBe(91);
    expect(r.live).toBe(false);
    expect(r.vsNifty).toBeNull();
  });

  it("summarises starred vs the rest", () => {
    const rows = [
      watchRow(item(), { sessions: 1, high: 115, low: 99, close: 110 }, { price: null, live: false }, 1000, { starred: true, count: 5 }),
      watchRow(item({ symbol: "BBB", starred: false }), { sessions: 1, high: 101, low: 90, close: 92 }, { price: null, live: false }, 1000, { starred: false, count: null }),
    ];
    const [starred, other, all] = watchSummary(rows);
    expect(starred).toMatchObject({ n: 1, pctUp: 100, pctHit10: 100, pctDown8: 0 });
    expect(other).toMatchObject({ n: 1, pctUp: 0, pctHit10: 0, pctDown8: 100 });
    expect(all?.avgRet).toBeCloseTo(1);
  });

  it("adds once and removes by symbol", () => {
    let f = addItem({ version: 1, items: [] }, item());
    f = addItem(f, item({ price: 999 }));
    expect(f.items).toHaveLength(1);
    expect(f.items[0]?.price).toBe(100);
    expect(removeItem(f, "AAA").items).toHaveLength(0);
  });
});

describe("liveIsFresh", () => {
  // Tue 10 Nov 2026, 11:00 IST = 05:30 UTC (market open); 20:00 IST = 14:30 UTC (closed).
  const open = Date.parse("2026-11-10T05:30:00Z");
  const closed = Date.parse("2026-11-10T14:30:00Z");
  it("needs a recent file while the market is open", () => {
    expect(liveIsFresh({ at: "2026-11-10T05:29:00Z", date: "2026-11-10" }, "2026-11-09", open)).toBe(true);
    expect(liveIsFresh({ at: "2026-11-10T05:20:00Z", date: "2026-11-10" }, "2026-11-09", open)).toBe(false);
  });
  it("accepts the day's last file after the close, but never one older than the screen", () => {
    expect(liveIsFresh({ at: "2026-11-10T10:15:00Z", date: "2026-11-10" }, "2026-11-10", closed)).toBe(true);
    expect(liveIsFresh({ at: "2026-11-09T10:15:00Z", date: "2026-11-09" }, "2026-11-10", closed)).toBe(false);
    expect(liveIsFresh(null, "2026-11-10", closed)).toBe(false);
  });
});

describe("msUntilLiveWindow", async () => {
  const { msUntilLiveWindow } = await import("./clock");
  it("waits until 09:15 IST on the next weekday", () => {
    // Tue 10 Nov 2026 20:00 IST → Wed 09:15 IST = 13h15m
    expect(msUntilLiveWindow(Date.parse("2026-11-10T14:30:00Z"))).toBe((13 * 60 + 15) * 60_000);
    // Fri 13 Nov 16:00 IST → Mon 16 Nov 09:15 IST
    expect(msUntilLiveWindow(Date.parse("2026-11-13T10:30:00Z"))).toBe(((2 * 24 + 17) * 60 + 15) * 60_000);
    // Inside the window (Tue 11:00 IST)
    expect(msUntilLiveWindow(Date.parse("2026-11-10T05:30:00Z"))).toBe(0);
  });
});
