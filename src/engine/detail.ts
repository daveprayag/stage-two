/** Everything the stock page shows for one symbol: bars, moving averages, levels, trendlines and the checklist. */
import { DEFAULT_LEVELS, supportResistance, trendline } from "./levels";
import { compact, maxIn, minIn, smaArr } from "./series";
import type { Level, PriceStore, ScreenRow, TrendLine } from "./types";

export interface ChartBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CheckItem {
  label: string;
  pass: boolean;
  value: string;
}

export interface StockDetail {
  symbol: string;
  name: string;
  industry: string | null;
  isin: string;
  band: number | null;
  bars: ChartBar[];
  ma50: (number | null)[];
  ma150: (number | null)[];
  ma200: (number | null)[];
  resistance: Level[];
  support: Level[];
  supportLine: TrendLine | null;
  resistanceLine: TrendLine | null;
  hi52: number;
  lo52: number;
  checklist: CheckItem[];
}

const fin = (x: number | undefined) => (x !== undefined && Number.isFinite(x) ? Math.round(x * 100) / 100 : null);

export function stockDetail(store: PriceStore, symbol: string, row: ScreenRow | undefined): StockDetail | null {
  const s = Object.values(store.stocks).find((x) => x.symbol === symbol);
  if (!s) return null;
  const cp = compact(store, s);
  const n = cp.close.length;
  if (n < 2) return null;
  const i = n - 1;
  const ma50 = smaArr(cp.close, 50);
  const ma150 = smaArr(cp.close, 150);
  const ma200 = smaArr(cp.close, 200);
  const d = { dates: cp.dates, high: cp.high, low: cp.low, close: cp.close };
  const { resistance, support } = supportResistance(d, i, { ...DEFAULT_LEVELS, max: 3, preferTouches: 2 });
  const yr = Math.min(252, n);
  const hi52 = maxIn(cp.high, i - yr + 1, i);
  const lo52 = minIn(cp.low, i - yr + 1, i);
  const c = cp.close[i] as number;
  const m50 = ma50[i] as number;
  const m150 = ma150[i] as number;
  const m200 = ma200[i] as number;
  const m200ago = ma200[i - 21] as number;
  const ok = (x: number) => Number.isFinite(x);
  const r = (x: number) => (ok(x) ? x.toFixed(2) : "n/a");
  const checklist: CheckItem[] = [
    { label: "Price above the 150- and 200-day averages", pass: ok(m150) && ok(m200) && c > m150 && c > m200, value: `${r(c)} vs ${r(m150)} / ${r(m200)}` },
    { label: "150-day average above the 200-day", pass: ok(m150) && ok(m200) && m150 > m200, value: `${r(m150)} vs ${r(m200)}` },
    { label: "200-day average rising for at least a month", pass: ok(m200) && ok(m200ago) && m200 > m200ago, value: ok(m200ago) ? `${((m200 / m200ago - 1) * 100).toFixed(1)}% in 21 sessions` : "n/a" },
    { label: "50-day average above the 150- and 200-day", pass: ok(m50) && ok(m150) && ok(m200) && m50 > m150 && m50 > m200, value: `${r(m50)}` },
    { label: "Price above the 50-day average", pass: ok(m50) && c > m50, value: ok(m50) ? `${((c / m50 - 1) * 100).toFixed(1)}% above` : "n/a" },
    { label: "At least 30% above the 52-week low", pass: c >= 1.3 * lo52, value: `${((c / lo52 - 1) * 100).toFixed(0)}% above ${lo52.toFixed(2)}` },
    { label: "Within 25% of the 52-week high", pass: c >= 0.75 * hi52, value: `${((1 - c / hi52) * 100).toFixed(1)}% below ${hi52.toFixed(2)}` },
    { label: "Relative strength rating at least 70", pass: (row?.rs ?? 0) >= 70, value: row ? `RS ${row.rs}` : "not in the liquid universe" },
  ];
  return {
    symbol: s.symbol, name: s.name, industry: s.industry, isin: s.isin, band: s.band,
    bars: cp.dates.map((t, j) => ({ time: t, open: cp.open[j] as number, high: cp.high[j] as number, low: cp.low[j] as number, close: cp.close[j] as number, volume: cp.volume[j] as number })),
    ma50: ma50.map(fin), ma150: ma150.map(fin), ma200: ma200.map(fin),
    resistance, support,
    supportLine: trendline(d, i, "support"),
    resistanceLine: trendline(d, i, "resistance"),
    hi52, lo52, checklist,
  };
}
