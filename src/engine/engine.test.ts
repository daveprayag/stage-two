import { describe, expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { applyFactor, corpActionFactor, gapFactor } from "./adjust";
import { basePivot, cluster, supportResistance, swingHighs, trendline } from "./levels";
import { companyQuery, parseGoogleNews } from "./news";
import { parseAnnouncements, parseBhavcopyZip, parseCsv, parseIndexClose, parseNseDate, parsePriceBands } from "./nse";
import { newsShortlist } from "./pipeline";
import { computeScreen } from "./screen";
import { smaArr, stageAt } from "./series";
import type { PriceStore, ScreenRow, StockSeries } from "./types";
import { appendSession } from "./update";

const UDIFF_HEADER =
  "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4";
const udiffRow = (isin: string, sym: string, ser: string, name: string, o: number, h: number, l: number, c: number, pc: number, v: number) =>
  `2026-11-06,2026-11-06,CM,NSE,STK,1,${isin},${sym},${ser},,,,,"${name}",${o},${h},${l},${c},${c},${pc},,${c},,,${v},${v * c},10,F1,1,,,,,`;

describe("NSE parsers", () => {
  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,"b,c",d\n1,"say ""hi""",3\n')).toEqual([["a", "b,c", "d"], ["1", 'say "hi"', "3"]]);
  });
  it("reads EQ/BE stock rows from a UDiFF zip and skips other series", () => {
    const csv = [UDIFF_HEADER, udiffRow("INE1", "AAA", "EQ", "AAA, LTD", 10, 12, 9, 11, 10, 1000), udiffRow("INE2", "BBB", "GS", "Bond", 1, 1, 1, 1, 1, 1), udiffRow("INE3", "CCC", "BE", "CCC LTD", 5, 5, 5, 5, 5, 10)].join("\n");
    const { date, rows } = parseBhavcopyZip(zipSync({ "x.csv": strToU8(csv) }));
    expect(date).toBe("2026-11-06");
    expect(rows.map((r) => r.symbol)).toEqual(["AAA", "CCC"]);
    expect(rows[0]).toMatchObject({ name: "AAA, LTD", open: 10, high: 12, low: 9, close: 11, prevClose: 10, volume: 1000 });
  });
  it("reads index closes, price bands, dates and announcements", () => {
    expect(parseIndexClose("Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value\nNifty 500,06-11-2026,1,2,1,23456.7\n").get("NIFTY 500")).toBe(23456.7);
    const bands = parsePriceBands('Symbol,Series,Security Name,Band,Remarks\nAAA,EQ,A,20,"-"\nBBB,EQ,B,No Band,"-"\nCCC,SM,C,5,"-"\n');
    expect([bands.get("AAA"), bands.get("BBB"), bands.has("CCC")]).toEqual([20, null, false]);
    expect([parseNseDate("06-Nov-2026 23:57:53"), parseNseDate("6-11-2026"), parseNseDate("2026-11-06")]).toEqual(["2026-11-06", "2026-11-06", "2026-11-06"]);
    const ann = parseAnnouncements([
      { symbol: "AAA", desc: "Bagging/Receiving of orders/contracts", attchmntText: "Order worth Rs 500 Cr", an_dt: "06-Nov-2026 18:00:00", attchmntFile: "https://x/y.pdf" },
      { symbol: "AAA", desc: "Trading Window-XBRL", attchmntText: "closed", an_dt: "06-Nov-2026 18:00:00" },
    ]);
    expect(ann).toHaveLength(1);
    expect(ann[0]).toMatchObject({ symbol: "AAA", category: "Bagging/Receiving of orders/contracts", url: "https://x/y.pdf" });
  });
});

describe("split/bonus adjustment", () => {
  it("parses NSE corporate action subjects", () => {
    expect(corpActionFactor("Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share")).toBe(5);
    expect(corpActionFactor("Bonus 1:1")).toBe(2);
    expect(corpActionFactor("Bonus 2:1")).toBe(3);
    expect(corpActionFactor("Consolidation From Rs 1/- To Rs 10/-")).toBe(0.1);
    expect(corpActionFactor("Interim Dividend - Rs 24 Per Share")).toBeNull();
  });
  it("snaps unexplained gaps to common ratios but leaves crashes alone", () => {
    expect(gapFactor(1000, 201, 198)).toBe(5);
    expect(gapFactor(1000, 520, 500)).toBe(2);
    expect(gapFactor(1000, 700, 650)).toBeNull();
    expect(gapFactor(1000, 380, 360)).toBeNull(); // 2.6–2.8×: not near a common factor
  });
  it("divides earlier prices and multiplies earlier volumes", () => {
    const s = series([100, 110], [10, 20]);
    applyFactor(s, 2, 2);
    expect(s.c).toEqual([50, 55]);
    expect(s.v).toEqual([20, 40]);
  });
});

function series(c: number[], v: number[] = c.map(() => 1000), extra: Partial<StockSeries> = {}): StockSeries {
  return { isin: "INE1", symbol: "AAA", name: "AAA LTD", series: "EQ", industry: "Tech", band: null, listed: null, o: [...c], h: c.map((x) => x * 1.01), l: c.map((x) => x * 0.99), c: [...c], v: [...v], ...extra };
}

describe("appendSession", () => {
  const row = (isin: string, symbol: string, close: number, open = close) => ({ isin, symbol, series: "EQ", name: `${symbol} LTD`, open, high: Math.max(open, close), low: Math.min(open, close), close, prevClose: close, volume: 100 });
  it("adds a session, applies a split from the API, follows an ISIN change and trims the window", () => {
    const store: PriceStore = {
      version: 1, asOf: "2026-11-05", dates: ["2026-11-04", "2026-11-05"],
      stocks: { INE1: series([100, 100]), INE2: series([50, 50], undefined, { isin: "INE2", symbol: "BBB" }) },
      indices: { "NIFTY 500": [1, 1] },
    };
    const log = appendSession(store, {
      date: "2026-11-06",
      rows: [row("INE1", "AAA", 20), row("INE9", "BBB", 51)],
      indexCloses: new Map([["NIFTY 500", 2]]),
      corpActions: [{ symbol: "AAA", isin: "INE1", exDate: "2026-11-06", subject: "Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share" }],
    }, 2);
    expect(store.dates).toEqual(["2026-11-05", "2026-11-06"]);
    expect(store.stocks.INE1?.c).toEqual([20, 20]);
    expect(store.stocks.INE1?.v).toEqual([5000, 100]);
    expect(store.stocks.INE9?.c).toEqual([50, 51]);
    expect(store.stocks.INE2).toBeUndefined();
    expect(store.indices["NIFTY 500"]).toEqual([1, 2]);
    expect(log.join(" ")).toMatch(/ISIN INE2 → INE9/);
    expect(() => appendSession(store, { date: "2026-11-06", rows: [], indexCloses: new Map() })).toThrow();
  });
});

describe("levels", () => {
  // Two peaks near 120 with a dip between, then a drift back up.
  const close = [100, 105, 110, 115, 120, 115, 110, 105, 100, 104, 108, 112, 116, 119.5, 116, 112, 108, 104, 106, 108, 110, 112, 114];
  const d = { dates: close.map((_, k) => `d${k}`), high: close.map((x) => x + 1), low: close.map((x) => x - 1), close };
  it("finds swing highs and clusters them into one resistance with two touches", () => {
    expect(swingHighs(d.high, 0, close.length - 1, 3)).toEqual([4, 13]);
    const { resistance } = supportResistance(d, close.length - 1, { lookback: 50, k: 3, tolPct: 2.5, max: 3 });
    expect(resistance[0]).toMatchObject({ touches: 2 });
    expect(resistance[0]!.price).toBeCloseTo(120.75, 1);
    expect(cluster([{ idx: 0, price: 100 }, { idx: 1, price: 101 }, { idx: 2, price: 110 }], 2, ["a", "b", "c"]).map((l) => l.touches)).toEqual([2, 1]);
  });
  it("finds a base pivot only when the base is old enough and shallow", () => {
    expect(basePivot(d, close.length - 1, 20, 35, 5)).toBe(121);
    const rising = Array.from({ length: 50 }, (_, k) => 100 + k);
    expect(basePivot({ dates: rising.map(String), high: rising, low: rising, close: rising }, 49, 40)).toBeNull();
  });
  it("draws a rising support trendline through higher lows", () => {
    const c: number[] = [];
    for (let k = 0; k < 120; k++) c.push(100 + k * 0.5 + 8 * Math.sin(k / 6));
    const line = trendline({ dates: c.map((_, k) => `d${k}`), high: c.map((x) => x + 1), low: c.map((x) => x - 1), close: c }, 119, "support");
    expect(line).not.toBeNull();
    expect(line!.now).toBeLessThan(c[119]!);
  });
});

describe("stage and screen", () => {
  it("classifies Weinstein stages from the 150-day average", () => {
    const up = Array.from({ length: 260 }, (_, k) => 100 * 1.004 ** k);
    expect(stageAt(up, smaArr(up, 150), 259)).toBe(2);
    const down = [...up].reverse();
    expect(stageAt(down, smaArr(down, 150), 259)).toBe(4);
  });
  it("screens a synthetic market: a steady leader is tagged, a falling stock is not", () => {
    const n = 260;
    const dates = Array.from({ length: n }, (_, k) => `2025-${String(1 + Math.floor(k / 22)).padStart(2, "0")}-${String(1 + (k % 22)).padStart(2, "0")}`);
    const mk = (isin: string, symbol: string, f: (k: number) => number, vol = 200_000): StockSeries => {
      const c = Array.from({ length: n }, (_, k) => Math.round(f(k) * 100) / 100);
      return { isin, symbol, name: `${symbol} LTD`, series: "EQ", industry: "Tech", band: 20, listed: null, o: c, h: c.map((x) => x * 1.01), l: c.map((x) => x * 0.99), c, v: c.map(() => vol) };
    };
    const stocks: Record<string, StockSeries> = {};
    stocks.L = mk("L", "LEAD", (k) => 100 * 1.004 ** k);
    stocks.F = mk("F", "FALL", (k) => 300 * 0.997 ** k);
    for (let j = 0; j < 20; j++) stocks[`M${j}`] = mk(`M${j}`, `MID${j}`, (k) => 200 + 10 * Math.sin(k / (10 + j)));
    const store: PriceStore = { version: 1, asOf: dates[n - 1]!, dates, stocks, indices: { "NIFTY 500": dates.map((_, k) => 20000 + k) } };
    const s = computeScreen(store);
    const lead = s.rows.find((r) => r.symbol === "LEAD");
    expect(lead?.stage).toBe(2);
    expect(lead?.rs).toBeGreaterThanOrEqual(90);
    expect(lead?.tags).toContain("leader");
    expect(s.rows.find((r) => r.symbol === "FALL")).toBeUndefined();
    expect(s.market?.universe).toBe(22);
    expect(s.sectors[0]?.industry).toBe("Tech");
  });
});

describe("news helpers", () => {
  it("turns NSE names into search queries", () => {
    expect(companyQuery("BHARAT ELECTRONICS LTD", "BEL")).toBe("Bharat Electronics");
    expect(companyQuery("TECH MAHINDRA LIMITED", "TECHM")).toBe("Tech Mahindra");
    expect(companyQuery("ABB INDIA LIMITED", "ABB")).toBe("ABB India");
  });
  it("parses Google News RSS and strips the source suffix", () => {
    const xml = `<?xml version="1.0"?><rss><channel><item><title>BEL wins Rs 500 crore order - Economic Times</title><link>https://n/1</link><pubDate>Fri, 06 Nov 2026 10:00:00 GMT</pubDate><source url="https://et">Economic Times</source></item></channel></rss>`;
    expect(parseGoogleNews(xml)).toEqual([{ title: "BEL wins Rs 500 crore order", source: "Economic Times", url: "https://n/1", date: "2026-11-06" }]);
  });
  it("puts breakouts and setups first in the news shortlist", () => {
    const r = (symbol: string, tags: ScreenRow["tags"], score: number) => ({ symbol, tags, score }) as ScreenRow;
    expect(newsShortlist([r("A", ["leader"], 99), r("B", ["breakout"], 50), r("C", ["setup"], 60)], 2).map((x) => x.symbol)).toEqual(["B", "C"]);
  });
});
