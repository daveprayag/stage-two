import type { IndexTrend, MarketSnapshot } from "@/engine/types";
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

/** "above 50 & 200-day EMA", "above 50-day, below 200-day EMA", … */
function emaText(t: IndexTrend): string {
  const w = (b: boolean) => (b ? "above" : "below");
  return t.aboveEma50 === t.aboveEma200 ? `${w(t.aboveEma50)} 50 & 200-day EMA` : `${w(t.aboveEma50)} 50-day, ${w(t.aboveEma200)} 200-day EMA`;
}

/** One index: live level and day change, then its stage and EMA position from the last close. */
function IndexBlock({ t, note, asOf, initialLive }: { t: IndexTrend; note?: string; asOf: string; initialLive: LiveFile | null }) {
  return (
    <div className="min-w-0 bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs text-ink-3">
        <span className="font-medium text-ink-2">{t.index}</span>
        {note && <span>{note}</span>}
      </div>
      <LiveIndex name={t.index} close={t.close} chgPct={t.chgPct} asOf={asOf} initialLive={initialLive} />
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
        <StageLabel stage={t.stage} />
        <span className="text-ink-3">{emaText(t)}</span>
      </div>
    </div>
  );
}

export function MarketStrip({ m, asOf, initialLive }: { m: MarketSnapshot; asOf: string; initialLive: LiveFile | null }) {
  const verdict =
    m.stage === 2 && m.pctAbove50 >= 50
      ? "in an uptrend with broad participation: the backdrop breakouts need."
      : m.stage === 2
        ? "in an uptrend, but fewer than half of stocks are above their 50-day EMA. Be selective."
        : m.stage === 4
          ? "in a downtrend. Breakouts fail more often in this backdrop."
          : "moving sideways. Expect breakouts to be hit-and-miss.";
  return (
    <Card>
      <div className={`grid gap-px bg-line ${m.nifty50 ? "grid-cols-2" : "grid-cols-1"}`}>
        {m.nifty50 && <IndexBlock t={m.nifty50} asOf={asOf} initialLive={initialLive} />}
        <IndexBlock t={m} note="used for RS" asOf={asOf} initialLive={initialLive} />
      </div>
      <p className="border-t border-line px-4 py-3 text-sm text-ink-2 sm:px-5">
        {m.index} {verdict}
      </p>
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        <Breadth label="Stocks above 50-day EMA" value={m.pctAbove50} />
        <Breadth label="Stocks above 200-day EMA" value={m.pctAbove200} />
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
      <div className="grid grid-cols-2 gap-px bg-line">
        {["NIFTY 50", "NIFTY 500"].map((n) => (
          <div key={n} className="min-w-0 bg-surface p-4 sm:p-5">
            <div className="text-xs font-medium text-ink-2">{n}</div>
            <Bone className="mt-1.5 h-7 w-full max-w-40" />
            <Bone className="mt-1.5 h-3 w-full max-w-48" />
            <Bone className="mt-2 h-3 w-full max-w-44" />
          </div>
        ))}
      </div>
      <div className="border-t border-line px-4 py-3 sm:px-5">
        <Bone className="h-4 w-full sm:w-96" />
      </div>
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        {label("Stocks above 50-day EMA")}
        {label("Stocks above 200-day EMA")}
        {label("New 52-week highs / lows")}
        {label("In stage 2")}
      </dl>
    </Card>
  );
}
