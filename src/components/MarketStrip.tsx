import type { MarketSnapshot } from "@/engine/types";
import { int, pct, price } from "@/lib/format";
import { StagePill } from "./Badges";

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  const tone = value >= 60 ? "bg-up" : value >= 40 ? "bg-amber" : "bg-down";
  return (
    <div title={hint} className="min-w-[9rem] flex-1">
      <div className="flex items-baseline justify-between text-xs text-ink-2">
        <span>{label}</span>
        <span className="num text-ink">{value.toFixed(0)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

export function MarketStrip({ m }: { m: MarketSnapshot }) {
  const verdict =
    m.stage === 2 && m.pctAbove50 >= 50
      ? "Uptrend with broad participation: the backdrop breakouts need."
      : m.stage === 2
        ? "Index in an uptrend, but fewer than half of stocks are above their 50-day average: be selective."
        : m.stage === 4
          ? "Index in a downtrend: breakouts fail more often in this backdrop."
          : "Index moving sideways: expect breakouts to be hit-and-miss.";
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <div className="text-xs text-ink-2">{m.index}</div>
          <div className="flex items-baseline gap-2">
            <span className="num text-2xl font-medium">{price(m.close)}</span>
            <span className={`num text-sm ${m.chgPct >= 0 ? "text-up" : "text-down"}`}>{pct(m.chgPct, 2)}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <StagePill stage={m.stage} />
          <span className="text-xs text-ink-2">
            {m.aboveSma50 ? "Above" : "Below"} 50-day · {m.aboveSma200 ? "above" : "below"} 200-day
          </span>
        </div>
        <div className="flex min-w-[18rem] flex-1 flex-wrap gap-5">
          <Meter label="Stocks above 50-day avg" value={m.pctAbove50} hint="Share of liquid NSE stocks closing above their 50-day moving average" />
          <Meter label="Stocks above 200-day avg" value={m.pctAbove200} hint="Share of liquid NSE stocks closing above their 200-day moving average" />
        </div>
        <dl className="flex gap-5 text-xs">
          <div>
            <dt className="text-ink-2">52-wk highs</dt>
            <dd className="num text-base text-up">{int(m.newHighs)}</dd>
          </div>
          <div>
            <dt className="text-ink-2">52-wk lows</dt>
            <dd className="num text-base text-down">{int(m.newLows)}</dd>
          </div>
          <div>
            <dt className="text-ink-2">In stage 2</dt>
            <dd className="num text-base">
              {int(m.stage2Count)}
              <span className="text-ink-3">/{int(m.universe)}</span>
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 border-t border-line pt-3 text-sm text-ink-2">{verdict}</p>
    </section>
  );
}
