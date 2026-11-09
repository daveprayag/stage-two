"use client";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, LineStyle,
  type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";
import { ArrowUpRight } from "lucide-react";
import type { StockDetail } from "@/engine/detail";

/** TradingView chart for an NSE symbol (TradingView writes "&" and "-" as "_": M&M → NSE:M_M, BAJAJ-AUTO → NSE:BAJAJ_AUTO). */
export function tradingViewUrl(symbol: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(`NSE:${symbol.replace(/[&-]/g, "_")}`)}`;
}

type Overlay = "ma50" | "ma150" | "ma200" | "levels" | "trend";
const RANGES = [
  { label: "3M", bars: 63 },
  { label: "6M", bars: 126 },
  { label: "1Y", bars: 252 },
  { label: "All", bars: 0 },
];

function css(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** "#0f7a5c" → "rgba(15,122,92,a)" (canvas colours; tokens are hex). */
function alpha(hex: string, a: number): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? `rgba(${parseInt(m[1] as string, 16)},${parseInt(m[2] as string, 16)},${parseInt(m[3] as string, 16)},${a})` : hex;
}

export function PriceChart({ d }: { d: StockDetail }) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<IChartApi | null>(null);
  const [on, setOn] = useState<Record<Overlay, boolean>>({ ma50: true, ma150: false, ma200: true, levels: true, trend: true });
  const [range, setRange] = useState(126);
  const [theme, setTheme] = useState(0);

  useEffect(() => {
    const bump = () => setTheme((t) => t + 1);
    window.addEventListener("themechange", bump);
    const mq = matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", bump);
    return () => {
      window.removeEventListener("themechange", bump);
      mq.removeEventListener("change", bump);
    };
  }, []);

  useEffect(() => {
    if (!el.current) return;
    const up = css("--up");
    const down = css("--down");
    const c = createChart(el.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: css("--ink-2"), fontFamily: "var(--font-geist-mono), ui-monospace, monospace", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: css("--chart-grid") }, horzLines: { color: css("--chart-grid") } },
      rightPriceScale: { borderColor: css("--line") },
      timeScale: { borderColor: css("--line"), rightOffset: 4 },
      crosshair: { horzLine: { labelBackgroundColor: css("--ink-2") }, vertLine: { labelBackgroundColor: css("--ink-2") } },
    });
    chart.current = c;
    const candles = c.addSeries(CandlestickSeries, { upColor: up, downColor: down, wickUpColor: up, wickDownColor: down, borderVisible: false, priceLineVisible: false });
    candles.setData(d.bars.map((b) => ({ time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close })));
    candles.priceScale().applyOptions({ scaleMargins: { top: 0.06, bottom: 0.24 } });

    const vol = c.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceScaleId: "vol", lastValueVisible: false, priceLineVisible: false });
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    const upA = alpha(up, 0.4);
    const downA = alpha(down, 0.4);
    vol.setData(d.bars.map((b, j) => ({ time: b.time as Time, value: b.volume, color: j > 0 && b.close < (d.bars[j - 1]?.close ?? b.close) ? downA : upA })));

    const line = (values: (number | null)[], color: string, width: 1 | 2 = 2, style: LineStyle = LineStyle.Solid) => {
      const s: ISeriesApi<"Line"> = c.addSeries(LineSeries, { color, lineWidth: width, lineStyle: style, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(d.bars.flatMap((b, j) => (values[j] === null || values[j] === undefined ? [] : [{ time: b.time as Time, value: values[j] as number }])));
    };
    if (on.ma150) line(d.ma150, css("--chart-ma150"), 1, LineStyle.Dashed);
    if (on.ma200) line(d.ma200, css("--chart-ma200"));
    if (on.ma50) line(d.ma50, css("--chart-ma50"));

    if (on.levels) {
      const wide = el.current.clientWidth >= 560;
      for (const [levels, color, tag] of [[d.resistance, down, "R"], [d.support, up, "S"]] as const) {
        for (const l of levels) {
          // Solid and 2px so the levels read clearly against candles; slightly translucent so price stays on top.
          candles.createPriceLine({ price: l.price, color: alpha(color, 0.85), lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: wide, title: wide ? `${tag} ${l.touches}×` : "" });
        }
      }
    }
    if (on.trend) {
      for (const [t, color] of [[d.supportLine, up], [d.resistanceLine, down]] as const) {
        if (!t || t.from.date >= t.to.date) continue;
        const s = c.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        s.setData([{ time: t.from.date as Time, value: t.from.price }, { time: t.to.date as Time, value: t.to.price }]);
      }
    }
    const n = d.bars.length;
    if (range > 0 && n > range) c.timeScale().setVisibleLogicalRange({ from: n - range, to: n + 3 });
    else c.timeScale().fitContent();
    return () => {
      c.remove();
      chart.current = null;
    };
  }, [d, on, range, theme]);

  const toggle = (k: Overlay, label: string, color: string, dashed = false) => (
    <button
      key={k}
      onClick={() => setOn((o) => ({ ...o, [k]: !o[k] }))}
      aria-pressed={on[k]}
      className={`flex shrink-0 items-center gap-2 py-1 text-xs transition-colors ${on[k] ? "text-ink" : "text-ink-3 line-through decoration-ink-3/60"}`}
    >
      <span className="h-0 w-4 border-t-2" style={{ borderColor: on[k] ? color : "var(--line-strong)", borderStyle: dashed ? "dashed" : "solid" }} />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {toggle("ma50", "50-day", "var(--chart-ma50)")}
          {toggle("ma200", "200-day", "var(--chart-ma200)")}
          {toggle("ma150", "150-day", "var(--chart-ma150)", true)}
          {toggle("levels", "Support / resistance", "var(--down)")}
          {toggle("trend", "Trendlines", "var(--up)")}
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
        <div className="flex rounded-lg bg-surface-2 p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.bars)}
              aria-pressed={range === r.bars}
              className={`rounded-md px-3 py-1 text-xs transition-colors ${range === r.bars ? "bg-surface text-ink shadow-sm" : "text-ink-3 hover:text-ink"}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        <a
          href={tradingViewUrl(d.symbol)}
          target="_blank"
          rel="noreferrer"
          className="flex h-7 items-center gap-1 rounded-lg border border-line px-2.5 text-xs whitespace-nowrap text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
        >
          TradingView <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        </div>
      </div>
      <div ref={el} className="h-[300px] w-full sm:h-[420px]" />
    </div>
  );
}
