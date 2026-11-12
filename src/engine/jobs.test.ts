import { afterEach, describe, expect, it, vi } from "vitest";
import { strToU8, zipSync } from "fflate";
import { refreshFinancials, repairIndexCloses, runEod, runLive, runNews, type LiveFile } from "./jobs";
import { MemoryStorage, P } from "./storage";
import { decodeStore, encodeStore, type StoreHeadFile } from "./storefile";
import type { TrackEntry } from "./track";
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

    // The track record is a forward record (every stock labelled first, so the reruns make no NSE sector requests).
    await st.putJson(P.sectors, Object.fromEntries([...Object.values(s0.stocks).map((x) => [x.symbol, "Hot"]), ["NEWCO", "Hot"]]));
    // A rebuild leaves a recorded day alone...
    const day = (await st.getJson<TrackEntry[]>(P.track))![0]!;
    await st.putJson(P.track, [{ ...day, lists: {} }]);
    expect((await runEod(st, { rebuild: true, force: true })).ok).toBe(true);
    expect((await st.getJson<TrackEntry[]>(P.track))![0]!.lists).toEqual({});
    // ...the evening news job finishes the day and marks it final...
    const enrich = async (_asOf: string, items: { symbol: string }[]) => Object.fromEntries(items.map((i) => [i.symbol, { headlines: [], ai: null }]));
    expect((await runNews(st, enrich, { financialsMax: 0 })).ok).toBe(true);
    const finished = (await st.getJson<TrackEntry[]>(P.track))![0]!;
    expect(finished.final).toBe(true);
    expect(Object.keys(finished.lists).length).toBeGreaterThan(0);
    // ...and later rebuilds and news runs keep it exactly as it was.
    await st.putJson(P.track, [{ ...finished, lists: { leader: [] } }]);
    await runEod(st, { rebuild: true, force: true });
    await runNews(st, enrich, { force: true, financialsMax: 0 });
    expect((await st.getJson<TrackEntry[]>(P.track))![0]!.lists).toEqual({ leader: [] });
  }, 60_000);

  it("fills index closes NSE published after the bhavcopy, and only for recent sessions without them", async () => {
    const head = { dates: ["2026-11-10", "2026-11-11", "2026-11-12"], indices: { "NIFTY 500": [23500, 23779.3, null] } } as unknown as StoreHeadFile;
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return url.includes("ind_close_all_12112026")
        ? new Response("Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value\nNifty 500,12-11-2026,1,1,1,23901.5\nNifty 50,12-11-2026,1,1,1,26100\n")
        : new Response("", { status: 404 });
    });
    const log: string[] = [];
    expect(await repairIndexCloses(head, log)).toEqual(["2026-11-12"]);
    expect(head.indices["NIFTY 500"]).toEqual([23500, 23779.3, 23901.5]);
    expect(head.indices["NIFTY 50"]).toEqual([null, null, 26100]);
    expect(urls).toHaveLength(1);
    expect(await repairIndexCloses(head, log)).toEqual([]);
    expect(urls).toHaveLength(1);
  });

  it("results filings: reads the latest quarter and its year-ago filing once, and keeps them", async () => {
    const st = new MemoryStorage();
    const x = (rev: number, pat: number) =>
      `<xbrli:context id="OneD"><xbrli:period><xbrli:startDate>QS</xbrli:startDate><xbrli:endDate>QE</xbrli:endDate></xbrli:period></xbrli:context>` +
      `<in-capmkt:RevenueFromOperations contextRef="OneD">${rev}</in-capmkt:RevenueFromOperations><in-capmkt:ProfitLossForPeriod contextRef="OneD">${pat}</in-capmkt:ProfitLossForPeriod>`;
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (url.includes("integrated-filing-results")) return Response.json({ data: [
        { type: "Integrated Filing- Financials", qe_Date: "30-SEP-2026", consolidated: "Standalone", broadcast_Date: "05-Nov-2026 21:44:07", xbrl: "https://a/now.xml" },
        { type: "Integrated Filing- Financials", qe_Date: "30-SEP-2025", consolidated: "Standalone", broadcast_Date: "06-Nov-2025 10:00:00", xbrl: "https://a/ago.xml" },
      ] });
      if (url.endsWith("now.xml")) return new Response(x(6515667000, 100443000).replace("QS", "2026-07-01").replace("QE", "2026-09-30"));
      if (url.endsWith("ago.xml")) return new Response(x(5800000000, 32000000).replace("QS", "2025-07-01").replace("QE", "2025-09-30"));
      return new Response("", { status: 404 });
    });
    const log: string[] = [];
    const f = await refreshFinancials(st, ["AVADH"], {}, log, "2026-11-11");
    expect(f.bySymbol.AVADH).toMatchObject({ qe: "2026-09-30", filed: "2026-11-05", now: { revenueCr: 651.57, profitCr: 10.04 }, yearAgo: { revenueCr: 580, profitCr: 3.2 }, revenueYoY: 12.3, profitYoY: 213.7 });
    expect(urls).toHaveLength(3);
    // Checked today and nothing new: no requests the next night.
    await refreshFinancials(st, ["AVADH"], {}, log, "2026-11-12");
    expect(urls).toHaveLength(3);
  }, 30_000);

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
  }, 30_000);

  it("live job: every stored stock and every index from two NSE requests", async () => {
    const st = new MemoryStorage();
    await st.putJson(P.closes, { AAA: ["INE000A", 100], BBB: ["INE000B", 50] });
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      if (url.includes("stocksTraded"))
        return Response.json({ timestamp: "09-Nov-2026 14:05:10", total: { data: [
          { symbol: "AAA", series: "EQ", lastPrice: 104.5, pchange: 4.5, totalTradedVolumecsv: 1200 },
          { symbol: "BBB", series: "SM", lastPrice: 51, pchange: 2, totalTradedVolumecsv: 10 },
          { symbol: "ZZZ", series: "EQ", lastPrice: 9, pchange: 1, totalTradedVolumecsv: 5 },
        ] } });
      return Response.json({ timestamp: "09-Nov-2026 14:05", data: [{ index: "NIFTY 500", last: 23567, variation: 77.8, percentChange: 0.33, open: 23543.1, high: 23567, low: 23388.2, previousClose: 23489.2 }] });
    });
    const rec = await runLive(st, { force: true });
    expect(rec.ok).toBe(true);
    expect(urls).toHaveLength(2);
    const live = (await st.getJson<LiveFile>(P.live))!;
    expect(live.date).toBe("2026-11-09");
    expect(live.q).toEqual({ AAA: [104.5, 4.5, 1200] }); // BBB is SME series, ZZZ not stored
    expect(live.indices["NIFTY 500"]).toMatchObject({ last: 23567, pChange: 0.33, prevClose: 23489.2 });
  }, 30_000);
});
