/**
 * The momentum screener. Inputs: the price store as of its last session. Output: one row per stock that passes at
 * least one screen, plus market breadth and sector strength. Pure (no I/O).
 *
 * Screens (descriptive shortlists for a human to review; none is a tested buy signal):
 *  - momentum: the winner profile from livermore's research (EXPERIMENTS "Winner patterns", 2021–24, checked on a later
 *              period): RS ≥ 80, 20-day ADR in the top 40% of liquid stocks, industry in the top 40% by median 3-month
 *              return, stage 2. Those stocks hit +50% within 6 months 47% of the time vs 29% for all liquid stocks.
 *  - breakout: closed above the top of a ≥ 8-week base on ≥ 1.5× average volume, in a stage-2 uptrend.
 *  - setup:    trend template ≥ 7/8, within 15% of the 52-week high, tight 10-day range, volume drying up.
 *  - fresh2:   entered stage 2 within the last 30 sessions, RS ≥ 70, template ≥ 6/8, within 25% of the high.
 *  - leader:   RS ≥ 90 with the trend template ≥ 7/8.
 *  - ankur:    Ankur Patel's volume, 20 EMA or flag scan, or a livermore rule-engine setup, fired today (his broad
 *              momentum list is shown as a label only).
 */
import { defaultConfig, type MomentumLeg } from "./core/config";
import { computeFeatures, type Features } from "./core/indicators";
import { ema20MomentumLegs, ema20ScanAt, momentumAny, volumeScanAt } from "./core/scanners";
import { detectAll, prepareInstrument } from "./core/setups/index";
import { rsi } from "./core/systematic";
import { technicalPass } from "./topsetup";
import { basePivot, supportResistance } from "./levels";
import { compact, countRallies, findBase, findResume, maxIn, median, minIn, phaseOf, retPct, smaArr, stageAt, toBars } from "./series";
import type { MarketSnapshot, PriceStore, ScreenFile, ScreenRow, ScreenTag, SectorRow, Stage, StockSeries } from "./types";

export const BENCHMARK = "NIFTY 500";

/** Liquidity floor for the screen universe: close > ₹30 and 50-day average traded value ≥ ₹2 Cr. */
export const MIN_CLOSE = 30;
export const MIN_TURNOVER_CR = 2;
/** 2% and 5% band stocks are thin and easy to push around (Ankur excludes them). */
const EXCLUDED_BANDS = new Set([2, 5]);

/** Momentum list legs (RULEBOOK scanner 4): close ≥ multiple × low N bars ago. */
const MOMENTUM_LIST_LEGS: MomentumLeg[] = [
  { barsAgo: 5, multiple: 1.1 },
  { barsAgo: 20, multiple: 1.3 },
  { barsAgo: 30, multiple: 1.2 },
  { barsAgo: 90, multiple: 1.3 },
  { barsAgo: 126, multiple: 1.8 },
  { barsAgo: 231, multiple: 1.9 },
];

/**
 * What the screen keeps per stock after analysing it: scalars only, so stocks can be streamed one at a time (the
 * Cloudflare Worker has 128 MB of memory) and the bar arrays dropped as soon as each stock is done.
 */
export interface Work {
  rsRaw: number;
  liquid: boolean;
  row: Omit<ScreenRow, "rs" | "tags" | "score" | "template"> & { templateBase: number };
  /** Today's high/low set a new 52-week high/low (prior 251 sessions). */
  newHigh: boolean;
  newLow: boolean;
  /** Closed above its 50- / 200-day average (market breadth). */
  above50: boolean;
  above200: boolean;
}

/** The parts of the store the screen needs besides the stocks themselves. */
export type StoreHead = Pick<PriceStore, "asOf" | "dates" | "indices">;

/**
 * ETFs and index funds trade in NSE's EQ series too; names look like "ICICIPRAMC - EVIETF", "BFAM - NIFTYBETF",
 * "QUANTUM NIFTY 50 ETF". The screener is for stocks, so they are left out.
 */
const FUND_NAME = /(AMC|AML|MF|BFAM|BNP|SHRIRAM|ETF)\s+-\s|\bETF\b/i;
export const isFund = (symbol: string, name: string) => FUND_NAME.test(name) || /(ETF|BEES)$/.test(symbol);

function flagScanAt(f: Features, i: number): boolean {
  // RULEBOOK scanner 5 (flag scan): quiet days, above EMA50, not extended, liquid, plus a pole.
  if (i < 90) return false;
  const chg = (j: number) => Math.abs(f.changePct[j] as number);
  const c = f.close[i] as number;
  const pole = [
    [5, 1.1],
    [10, 1.2],
    [30, 1.2],
    [90, 1.3],
  ].some(([n, m]) => c >= (m as number) * (f.close[i - (n as number)] as number));
  return (
    chg(i) <= 2.5 && chg(i - 1) <= 2.5 && chg(i - 2) <= 3.5 && c > (f.ema50[i] as number) &&
    c <= 1.25 * (f.sma50[i] as number) && c > 30 && (f.volSma50[i] as number) >= 50_000 && pole
  );
}

function momentumListAt(f: Features, i: number): boolean {
  // RULEBOOK scanner 4 (momentum list): quiet day, not extended, turnover ≥ ₹5 Cr, any momentum leg.
  const c = f.close[i] as number;
  return (
    Math.abs(f.changePct[i] as number) <= 4.5 && c <= 1.25 * (f.sma50[i] as number) &&
    (f.turnover50Cr[i] as number) >= 5 && momentumAny(f, i, MOMENTUM_LIST_LEGS) !== null
  );
}

export function analyseStock(store: StoreHead, s: StockSeries, bench: (number | null)[]): Work | null {
  if (s.series !== "EQ" || isFund(s.symbol, s.name)) return null;
  const cp = compact(store, s);
  const n = cp.close.length;
  const i = n - 1;
  if (n < 160 || cp.dates[i] !== store.asOf) return null;
  const cfg = defaultConfig;
  const f = computeFeatures(toBars(cp, s), cfg);
  const close = cp.close;
  const c = close[i] as number;
  const ma50 = smaArr(close, 50);
  const ma150 = smaArr(close, 150);
  const ma200 = smaArr(close, 200);
  const turnoverCr = f.turnover50Cr[i] as number;
  const liquid = c > MIN_CLOSE && turnoverCr >= MIN_TURNOVER_CR && !(s.band !== null && EXCLUDED_BANDS.has(s.band));

  const yr = Math.min(252, n);
  const hi52 = maxIn(cp.high, i - yr + 1, i);
  const lo52 = minIn(cp.low, i - yr + 1, i);
  const r = (b: number) => retPct(close, i, b);
  const r3 = r(63);
  const rsRaw = 0.4 * (r3 ?? 0) + 0.2 * (r(126) ?? r3 ?? 0) + 0.2 * (r(189) ?? r(126) ?? r3 ?? 0) + 0.2 * (r(252) ?? r(189) ?? r(126) ?? r3 ?? 0);

  // RS line: stock / NIFTY 500 at a 52-week high.
  let rsLineHigh = false;
  const ratios: number[] = [];
  for (let j = Math.max(0, n - yr); j < n; j++) {
    const b = bench[cp.gidx[j] as number];
    if (b) ratios.push((close[j] as number) / b);
  }
  if (ratios.length > 20) rsLineHigh = (ratios[ratios.length - 1] as number) >= Math.max(...ratios) * 0.999;

  // Stage and how long it has been in stage 2.
  const stage = (stageAt(close, ma150, i) ?? 1) as Stage;
  let stageAge: number | null = null;
  if (stage === 2) {
    stageAge = 0;
    for (let j = i - 1; j >= Math.max(0, i - 120); j--) {
      if (stageAt(close, ma150, j) !== 2) break;
      stageAge++;
    }
  }

  // Trend template (Minervini) except criterion 8 (RS), added after ranking.
  const m50 = ma50[i] as number;
  const m150 = ma150[i] as number;
  const m200 = ma200[i] as number;
  const has200 = Number.isFinite(m200);
  const m200ago = ma200[i - 21];
  const crit = [
    c > m150 && (!has200 || c > m200),
    has200 ? m150 > m200 : false,
    has200 && m200ago !== undefined && Number.isFinite(m200ago) ? m200 > m200ago : false,
    m50 > m150 && (!has200 || m50 > m200),
    c > m50,
    c >= 1.3 * lo52,
    c >= 0.75 * hi52,
  ];

  const vol = cp.volume;
  const avg = (from: number, to: number) => {
    let sum = 0;
    for (let j = from; j <= to; j++) sum += vol[j] as number;
    return sum / (to - from + 1);
  };
  const v50 = avg(i - 49, i);
  const dryUp = v50 > 0 ? avg(i - 4, i) / v50 : 1;
  const rvol = v50 > 0 ? ((vol[i] as number) / v50) * 100 : 0;
  const tight10 = ((maxIn(cp.high, i - 9, i) - minIn(cp.low, i - 9, i)) / c) * 100;
  let upV = 0;
  let downV = 0;
  for (let j = Math.max(1, i - 49); j <= i; j++) {
    if ((close[j] as number) > (close[j - 1] as number)) upV += vol[j] as number;
    else if ((close[j] as number) < (close[j - 1] as number)) downV += vol[j] as number;
  }
  const upDownVol = downV > 0 ? upV / downV : upV > 0 ? 9.99 : 1;
  const rsi14v = rsi(close, 14)[i] as number;
  const ma50ago = ma50[i - 10];
  // Rallies since the stock left its latest sideways base (none found in our history = late).
  const base = findBase(close, ma50, i);
  const rallyCount = base ? countRallies(close, base.end, i) : { count: 0, largestPct: 0, lastPct: 0 };
  const riseFromBase = base ? (c / base.high - 1) * 100 : null;

  const ohlc = { dates: cp.dates, high: cp.high, low: cp.low, close };
  const { resistance } = supportResistance(ohlc, i);
  const nearest = resistance[0]?.price ?? null;
  const pivot = basePivot(ohlc, i);
  const prev = close[i - 1] as number;
  const chgPct = (c / prev - 1) * 100;
  const breakout = pivot !== null && c > pivot && prev <= pivot && rvol >= 150 && chgPct > 0;

  // Ankur's scans and the livermore rule engine's setups.
  const scans: string[] = [];
  if (volumeScanAt(f, i, cfg)) scans.push("Volume (range expansion)");
  if (ema20ScanAt(f, i, cfg, ema20MomentumLegs(cfg))) scans.push("20 EMA pullback");
  if (momentumListAt(f, i)) scans.push("Momentum list");
  if (flagScanAt(f, i)) scans.push("Flag");
  let setup: string | null = null;
  if (liquid) {
    const ctx = prepareInstrument({ isin: s.isin, symbol: s.symbol, bars: f.bars as never }, cfg);
    const res = detectAll(ctx, i, cfg);
    if (res.universeOk && res.signals[0]) setup = res.signals[0].setup;
  }

  const prior = (arr: number[], fn: typeof maxIn) => (i >= 1 ? fn(arr, i - yr + 1, i - 1) : Number.NaN);
  const newHigh = (cp.high[i] as number) > prior(cp.high, maxIn);
  const newLow = (cp.low[i] as number) < prior(cp.low, minIn);
  return {
    rsRaw, liquid, newHigh, newLow, above50: c > m50, above200: has200 && c > m200,
    row: {
      symbol: s.symbol, isin: s.isin, name: s.name, industry: s.industry, close: c, chgPct,
      rsLineHigh, ret1m: r(21), ret3m: r3, ret6m: r(126),
      pctFromHigh: (1 - c / hi52) * 100, pctAboveLow: (c / lo52 - 1) * 100,
      sma50: m50, sma150: m150, sma200: has200 ? m200 : null, stage, stageAge,
      templateBase: crit.filter(Boolean).length,
      tight10, dryUp, rvol, adr: f.adr20[i] as number, turnoverCr, band: s.band,
      resistance: nearest, pctToResistance: nearest !== null ? (nearest / c - 1) * 100 : null,
      breakout, scans, setup,
      rsi14: Number.isFinite(rsi14v) ? rsi14v : null,
      ema20: f.ema20[i] as number,
      ema50: f.ema50[i] as number,
      ma50Rising: ma50ago !== undefined && Number.isFinite(ma50ago) && m50 > ma50ago,
      ma200Rising: has200 && m200ago !== undefined && Number.isFinite(m200ago) && m200 > m200ago,
      upDownVol,
      runUp2m: (c / minIn(cp.low, i - 41, i) - 1) * 100,
      sectorRank: null,
      resume: findResume(close, cp.high, cp.low, i),
      sectorLeaders: 0,
      rallies: rallyCount.count,
      riseFromBase,
      inBase: base?.inBase ?? false,
      baseDate: base ? (cp.dates[base.end] as string) : null,
      largestRallyPct: rallyCount.largestPct,
      phase: phaseOf(stage, rallyCount, base !== null),
    },
  };
}

function tagsFor(r: ScreenRow): ScreenTag[] {
  const t: ScreenTag[] = [];
  if (r.breakout && (r.stage === 2 || r.template >= 6)) t.push("breakout");
  if (r.template >= 7 && r.pctFromHigh <= 15 && r.tight10 <= 12 && r.dryUp <= 0.9) t.push("setup");
  if (r.stage === 2 && r.stageAge !== null && r.stageAge <= 30 && r.rs >= 70 && r.template >= 6 && r.pctFromHigh <= 25) t.push("fresh2");
  if (r.rs >= 90 && r.template >= 7) t.push("leader");
  if (r.setup || r.scans.some((x) => x !== "Momentum list")) t.push("ankur");
  if (r.resume && r.stage === 2) t.push("resuming");
  return t;
}

function scoreFor(r: ScreenRow): number {
  return Math.round(
    (r.tags.includes("qualified") ? 25 : 0) + (r.tags.includes("momentum") ? 15 : 0) +
    r.rs * 0.5 + r.template * 5 + (r.pctFromHigh <= 10 ? 10 : 0) + (r.tight10 <= 8 ? 10 : 0) +
      (r.breakout ? 15 : 0) + (r.tags.includes("fresh2") ? 10 : 0) + (r.rsLineHigh ? 10 : 0) + (r.setup ? 5 : 0),
  );
}

function marketSnapshot(store: StoreHead, liquid: Work[], name = BENCHMARK): MarketSnapshot | null {
  const raw = store.indices[name];
  if (!raw) return null;
  const close = raw.filter((x): x is number => x !== null);
  const i = close.length - 1;
  if (i < 200) return null;
  const ma50 = smaArr(close, 50);
  const ma150 = smaArr(close, 150);
  const ma200 = smaArr(close, 200);
  const c = close[i] as number;
  const above = (k: "50" | "200") => liquid.filter((w) => (k === "50" ? w.above50 : w.above200)).length;
  return {
    index: name,
    close: c,
    chgPct: (c / (close[i - 1] as number) - 1) * 100,
    stage: (stageAt(close, ma150, i) ?? 1) as Stage,
    aboveSma50: c > (ma50[i] as number),
    aboveSma200: c > (ma200[i] as number),
    pctAbove50: liquid.length ? (above("50") / liquid.length) * 100 : 0,
    pctAbove200: liquid.length ? (above("200") / liquid.length) * 100 : 0,
    newHighs: liquid.filter((w) => w.newHigh).length,
    newLows: liquid.filter((w) => w.newLow).length,
    stage2Count: liquid.filter((w) => w.row.stage === 2).length,
    universe: liquid.length,
  };
}

/** Every liquid stock's row (tagged or not), plus the internals the market snapshot needs. */
/** Symbol → NSE sector for every stock (blob meta/sectors.json); overrides the store's index-list labels. */
export type Sectors = Record<string, string>;

/** Apply the sector map (overrides the store's index-list labels). */
export const withSector = (s: StockSeries, sectors?: Sectors): StockSeries => (sectors?.[s.symbol] ? { ...s, industry: sectors[s.symbol] as string } : s);

function analyseAll(store: PriceStore, sectors?: Sectors): { all: ScreenRow[]; liquid: Work[] } {
  const bench = store.indices[BENCHMARK] ?? [];
  const work: Work[] = [];
  for (const s of Object.values(store.stocks)) {
    const w = analyseStock(store, withSector(s, sectors), bench);
    if (w) work.push(w);
  }
  return rankWork(work);
}

/** Cross-sectional step: RS ratings, industry ranks, tags and scores for every liquid stock's row. */
export function rankWork(work: Work[]): { all: ScreenRow[]; liquid: Work[] } {
  const liquid = work.filter((w) => w.liquid);
  // RS rating: percentile of the weighted return among liquid stocks.
  const sorted = [...liquid].sort((a, b) => a.rsRaw - b.rsRaw);
  const rsOf = new Map<Work, number>();
  sorted.forEach((w, k) => rsOf.set(w, Math.max(1, Math.min(99, Math.round(((k + 1) / sorted.length) * 99)))));
  const all: ScreenRow[] = liquid.map((w) => {
    const rs = rsOf.get(w) ?? 1;
    const { templateBase, ...rest } = w.row;
    return { ...rest, rs, template: templateBase + (rs >= 70 ? 1 : 0), tags: [], score: 0 };
  });
  // Industry momentum: median 3-month return of each industry's liquid stocks, as a percentile among industries.
  const sectorRanks = industryRanks(all);
  const adrCut = quantile(all.map((r) => r.adr), MOMENTUM.adrQuantile);
  const strongByIndustry = new Map<string, number>();
  for (const r of all) if (r.industry && r.stage === 2 && r.rs >= 80) strongByIndustry.set(r.industry, (strongByIndustry.get(r.industry) ?? 0) + 1);
  for (const row of all) {
    row.sectorRank = row.industry ? (sectorRanks.get(row.industry)?.rank ?? null) : null;
    row.sectorLeaders = row.industry ? (strongByIndustry.get(row.industry) ?? 0) : 0;
    row.tags = tagsFor(row);
    if (row.rs >= MOMENTUM.minRs && row.adr >= adrCut && (row.sectorRank ?? 0) >= MOMENTUM.minSectorRank && row.stage === 2) row.tags.push("momentum");
    // Checked after the other tags: the entry-pattern check reads them.
    if (row.tags.length && technicalPass(row)) row.tags.push("qualified");
    row.score = scoreFor(row);
  }
  return { all, liquid };
}

/** Momentum-leader thresholds (livermore EXPERIMENTS "Winner patterns"). */
export const MOMENTUM = { minRs: 80, adrQuantile: 0.6, minSectorRank: 0.6 } as const;

function quantile(xs: number[], q: number): number {
  const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return Number.NaN;
  return v[Math.min(v.length - 1, Math.floor(q * v.length))] as number;
}

/** Industry → median 3-month return and its percentile rank among industries with ≥ 3 liquid stocks. */
function industryRanks(rows: ScreenRow[]): Map<string, { ret3m: number; rank: number; n: number }> {
  const by = new Map<string, number[]>();
  for (const r of rows) if (r.industry && r.ret3m !== null) (by.get(r.industry) ?? by.set(r.industry, []).get(r.industry))!.push(r.ret3m);
  const meds = [...by.entries()].filter(([, v]) => v.length >= 3).map(([k, v]) => ({ k, m: median(v), n: v.length }));
  const sorted = [...meds].sort((a, b) => a.m - b.m);
  const out = new Map<string, { ret3m: number; rank: number; n: number }>();
  sorted.forEach((x, idx) => out.set(x.k, { ret3m: x.m, rank: (idx + 1) / sorted.length, n: x.n }));
  return out;
}

/** All liquid stocks' rows, keyed by symbol (for the stock page). */
export function allRows(store: PriceStore, sectors?: Sectors): Map<string, ScreenRow> {
  return new Map(analyseAll(store, sectors).all.map((r) => [r.symbol, r]));
}

export function computeScreen(store: PriceStore, sectorMap?: Sectors): Omit<ScreenFile, "news" | "newsAt"> {
  return screenFromWork(store, analyseAll(store, sectorMap));
}

/** Build the screen file from ranked work (shared by the in-memory and the streaming paths). */
export function screenFromWork(store: StoreHead, { all, liquid }: { all: ScreenRow[]; liquid: Work[] }): Omit<ScreenFile, "news" | "newsAt"> {
  const byIndustry = new Map<string, ScreenRow[]>();
  for (const r of all) if (r.industry) (byIndustry.get(r.industry) ?? byIndustry.set(r.industry, []).get(r.industry))!.push(r);
  const sectors: SectorRow[] = [...byIndustry.entries()]
    .filter(([, rows]) => rows.length >= 3)
    .map(([industry, rows]) => ({
      industry,
      stocks: rows.length,
      ret3m: median(rows.map((r) => r.ret3m ?? 0)),
      rank: industryRanks(all).get(industry)?.rank ?? 0,
      rs: Math.round(median(rows.map((r) => r.rs))),
      stage2: rows.filter((r) => r.stage === 2).length / rows.length,
      ret1m: median(rows.map((r) => r.ret1m ?? 0)),
      leaders: [...rows].sort((a, b) => b.rs - a.rs).slice(0, 4).map((r) => r.symbol),
    }))
    .sort((a, b) => b.rs - a.rs);

  const rows = all.filter((r) => r.tags.length).sort((a, b) => b.score - a.score);
  return { version: 1, asOf: store.asOf, generatedAt: new Date().toISOString(), market: marketSnapshot(store, liquid), sectors, rows };
}
