"use client";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, createChart, HistogramSeries, LineSeries, LineStyle,
  type IChartApi, type ISeriesApi, type Time,
} from "lightweight-charts";
import type { StockDetail } from "@/engine/detail";

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
      for (const l of d.resistance) {
        candles.createPriceLine({ price: l.price, color: down, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `R ${l.touches}×` });
      }
      for (const l of d.support) {
        candles.createPriceLine({ price: l.price, color: up, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `S ${l.touches}×` });
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

  const chip = (k: Overlay, label: string, color: string) => (
    <button
      key={k}
      onClick={() => setOn((o) => ({ ...o, [k]: !o[k] }))}
      aria-pressed={on[k]}
      className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${on[k] ? "border-line-strong text-ink" : "border-line text-ink-3"}`}
    >
      <span className="h-0.5 w-3 rounded" style={{ background: on[k] ? color : "var(--line-strong)" }} />
      {label}
    </button>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chip("ma50", "50-day", "var(--chart-ma50)")}
        {chip("ma150", "150-day", "var(--chart-ma150)")}
        {chip("ma200", "200-day", "var(--chart-ma200)")}
        {chip("levels", "Support / resistance", "var(--down)")}
        {chip("trend", "Trendlines", "var(--up)")}
        <div className="ml-auto flex rounded-md border border-line p-0.5">
          {RANGES.map((r) => (
            <button key={r.label} onClick={() => setRange(r.bars)} className={`rounded px-2 py-0.5 text-xs ${range === r.bars ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink"}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={el} className="h-[340px] w-full sm:h-[440px]" />
    </div>
  );
}
