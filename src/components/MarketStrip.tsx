import type { MarketSnapshot } from "@/engine/types";
import { int } from "@/lib/format";
import { StageLabel } from "./Badges";
import type { LiveFile } from "@/engine/jobs";
import { LiveIndex } from "./LiveIndex";
import { Card } from "./Page";
import { Bone } from "./Skeleton";

function Breadth({ label, value }: { label: string; value: number }) {
  const tone = value >= 60 ? "bg-up" : value >= 40 ? "bg-amber" : "bg-down";
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 flex items-center gap-3">
        <span className="num text-lg text-ink">{value.toFixed(0)}%</span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
          <span className={`block h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
        </span>
      </dd>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num mt-1 text-lg text-ink">{children}</dd>
    </div>
  );
}

export function MarketStrip({ m, asOf, initialLive }: { m: MarketSnapshot; asOf: string; initialLive: LiveFile | null }) {
  const verdict =
    m.stage === 2 && m.pctAbove50 >= 50
      ? "Uptrend with broad participation: the backdrop breakouts need."
      : m.stage === 2
        ? "Index in an uptrend, but fewer than half of stocks are above their 50-day average. Be selective."
        : m.stage === 4
          ? "Index in a downtrend. Breakouts fail more often in this backdrop."
          : "Index moving sideways. Expect breakouts to be hit-and-miss.";
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-end justify-between gap-4 sm:justify-start sm:gap-6">
          <div>
            <div className="text-xs text-ink-3">{m.index}</div>
            <LiveIndex name={m.index} close={m.close} chgPct={m.chgPct} asOf={asOf} initialLive={initialLive} />
          </div>
          <div className="text-right text-xs sm:text-left">
            <StageLabel stage={m.stage} className="text-sm" />
            <div className="mt-1 text-ink-3">
              {m.aboveSma50 ? "Above" : "Below"} 50-day · {m.aboveSma200 ? "above" : "below"} 200-day
            </div>
          </div>
        </div>
        <p className="text-sm text-ink-2 sm:max-w-md sm:text-right">{verdict}</p>
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        <Breadth label="Stocks above 50-day avg" value={m.pctAbove50} />
        <Breadth label="Stocks above 200-day avg" value={m.pctAbove200} />
        <Stat label="New 52-week highs / lows">
          <span className="text-up">{int(m.newHighs)}</span>
          <span className="text-ink-3"> / </span>
          <span className="text-down">{int(m.newLows)}</span>
        </Stat>
        <Stat label="In stage 2">
          {int(m.stage2Count)}
          <span className="text-sm text-ink-3"> of {int(m.universe)}</span>
        </Stat>
      </dl>
    </Card>
  );
}

/** The market box while the latest data loads: labels shown, values as placeholders. */
export function MarketStripSkeleton() {
  const label = (t: string) => (
    <div className="bg-surface px-4 py-3.5 sm:px-5">
      <dt className="text-xs text-ink-3">{t}</dt>
      <dd className="mt-2">
        <Bone className="h-5 w-24" />
      </dd>
    </div>
  );
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-end justify-between gap-4 sm:justify-start sm:gap-6">
          <div>
            <div className="text-xs text-ink-3">NIFTY 500</div>
            <Bone className="mt-1.5 h-7 w-40" />
            <Bone className="mt-1.5 h-3 w-48" />
          </div>
          <div className="flex flex-col items-end gap-1.5 sm:items-start">
            <Bone className="h-4 w-16" />
            <Bone className="h-3 w-36" />
          </div>
        </div>
        <Bone className="h-4 w-full sm:w-80" />
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        {label("Stocks above 50-day avg")}
        {label("Stocks above 200-day avg")}
        {label("New 52-week highs / lows")}
        {label("In stage 2")}
      </dl>
    </Card>
  );
}
