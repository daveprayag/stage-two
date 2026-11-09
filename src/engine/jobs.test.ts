import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { runEod, runNews, watchSet } from "./jobs";
import { MemoryStorage, P } from "./storage";
import { decodeStore, encodeStore, type StoreHeadFile } from "./storefile";
import type { PriceStore, ScreenFile, StockSeries } from "./types";

const HEADER = "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4";

function store(): PriceStore {
  const n = 260;
  const dates = Array.from({ length: n }, (_, k) => {
    const d = new Date(Date.UTC(2025, 0, 1) + k * 86_400_000 * 1.4);
    return d.toISOString().slice(0, 10);
  });
  const stocks: Record<string, StockSeries> = {};
  for (let j = 0; j < 520; j++) {
    const c = Array.from({ length: n }, (_, k) => Math.round(100 * (1 + 0.002 * (j % 7)) ** k * 100) / 100);
    stocks[`INE${j}`] = { isin: `INE${j}`, symbol: `S${j}`, name: `S${j} LTD`, series: "EQ", industry: j % 2 ? "Hot" : "Cold", band: 20, listed: null, o: c, h: c.map((x) => x * 1.02), l: c.map((x) => x * 0.98), c, v: c.map(() => 300_000) };
  }
  return { version: 1, asOf: dates[n - 1]!, dates, stocks, indices: { "NIFTY 500": dates.map((_, k) => 20000 + k) } };
}

afterEach(() => vi.unstubAllGlobals());

describe("jobs on storage", () => {
  it("adds a new session by streaming the store, then saves the screen, rows, closes and track entry", async () => {
    const st = new MemoryStorage();
    const s0 = store();
    const { head, stocks } = await encodeStore(s0);
    await st.putJson(P.head, head);
    await st.putBytes(P.stocks, stocks, "application/gzip");
    // The next calendar day after asOf is the new session; everything else 404s.
    const next = new Date(Date.parse(`${s0.asOf}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const ymd = next.replaceAll("-", "");
    const rows = Object.values(s0.stocks).map((s) => {
      const c = (s.c[s.c.length - 1] as number) * 1.01;
      return `${next},${next},CM,NSE,STK,1,${s.isin},${s.symbol},EQ,,,,,"${s.name}",${c},${c * 1.01},${c * 0.99},${c},${c},${c / 1.01},,${c},,,300000,1,10,F1,1,,,,,`;
    });
    rows.push(`${next},${next},CM,NSE,STK,1,INENEW,NEWCO,EQ,,,,,"NEWCO LTD",50,52,49,51,51,50,,51,,,100000,1,10,F1,1,,,,,`);
    const zip = zipSync({ "b.csv": strToU8([HEADER, ...rows].join("\n")) });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url.includes(`_${ymd}_F_0000`)) return new Response(init?.method === "HEAD" ? null : zip, { status: 200 });
      if (url.includes("corporates-corporateActions")) return new Response("[]", { status: 200 });
      if (url.includes("ind_close_all")) return new Response("Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value\nNifty 500,x,1,1,1,21000\n", { status: 200 });
      if (url.includes("getSymbolData")) return new Response(JSON.stringify({ equityResponse: [{ secInfo: { sector: "Capital Goods" } }] }), { status: 200 });
      return new Response("", { status: 404 });
    });
    const rec = await runEod(st, { source: "test" });
    expect(rec.ok).toBe(true);
    expect(rec.detail).toBe(`added ${next}`);
    const head2 = (await st.getJson<StoreHeadFile>(P.head))!;
    expect(head2.asOf).toBe(next);
    expect(head2.dates).toHaveLength(261); // 260 + the new session (window is 300)
    expect(head2.isins).toContain("INENEW");
    const s1 = await decodeStore(head2, (await st.getBytes(P.stocks))!);
    expect(Object.keys(s1.stocks)).toHaveLength(521);
    expect(s1.stocks.INE1?.c.at(-1)).toBeCloseTo((s0.stocks.INE1?.c.at(-1) as number) * 1.01, 6);
    expect(s1.indices["NIFTY 500"]?.at(-1)).toBe(21000);
    const screen = (await st.getJson<ScreenFile>(P.screen))!;
    expect(screen.asOf).toBe(next);
    expect((await st.getJson<unknown[]>(P.rows))!.length).toBeGreaterThan(500);
    expect((await st.getJson<Record<string, [string, number]>>(P.closes))!.NEWCO).toEqual(["INENEW", 51]);
    expect((await st.getJson<unknown[]>(P.track))!.length).toBe(1);
    expect((await st.getJson<Record<string, string>>(P.sectors))!.NEWCO).toBe("Capital Goods");
    // A second call within 5 minutes is throttled and not logged.
    expect((await runEod(st)).skipped).toBe(true);
  }, 60_000);

  it("merges headlines and summaries from the enrich endpoint into the screen", async () => {
    const st = new MemoryStorage();
    const row = { symbol: "AAA", name: "AAA LTD", industry: "Hot", tags: ["momentum"], score: 1, chgPct: 1, ret1m: 5, pctFromHigh: 2, stage: 2, breakout: false } as never;
    await st.putJson(P.screen, { version: 1, asOf: "2026-11-06", generatedAt: "", market: null, sectors: [], rows: [row], news: {}, newsAt: null } satisfies ScreenFile);
    vi.stubGlobal("fetch", async () => new Response("[]", { status: 200 }));
    const rec = await runNews(st, async (_asOf, items) => Object.fromEntries(items.map((i) => [i.symbol, { headlines: [{ title: "T", source: "S", url: "u", date: "2026-11-06" }], ai: { summary: "ok", sentiment: "positive" as const, catalysts: [], redFlags: [] } }])));
    expect(rec.ok).toBe(true);
    const s = (await st.getJson<ScreenFile>(P.screen))!;
    expect(s.news.AAA?.ai?.summary).toBe("ok");
    expect(s.newsAt).not.toBeNull();
    expect(watchSet(s)).toEqual(["AAA"]);
  }, 30_000);
});
