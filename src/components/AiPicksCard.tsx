import Link from "next/link";
import type { AiPicks } from "@/engine/aipicks";
import type { ScreenRow } from "@/engine/types";
import { InfoTip } from "./InfoTip";
import { Card } from "./Page";
import { Bone } from "./Skeleton";

const ABOUT =
  "Each evening an AI model reads the Strongest and Momentum leaders lists (trend, returns, volatility, volume, sector, news and results) and picks the 5 it judges most likely to beat the NIFTY 500 over the next 3 months. It's an experiment: it changes no star or check, and the Track record page compares its picks with the lists. Keep it only if it beats them over 3–6 months.";

function Header() {
  return (
    <div className="flex items-center gap-2 px-4 pt-4 sm:px-5">
      <h2 className="text-sm font-medium text-ink">AI picks</h2>
      <span className="rounded-full border border-line px-2 py-px text-[11px] text-ink-3">Experiment</span>
      <InfoTip label="AI picks">{ABOUT}</InfoTip>
    </div>
  );
}

/** Today's 5 AI picks with the reason for each; nothing if there are none for this session. */
export function AiPicksCard({ picks, rows, asOf }: { picks: AiPicks | null | undefined; rows: ScreenRow[]; asOf: string }) {
  if (!picks || picks.asOf !== asOf || !picks.picks.length) return null;
  const bySymbol = new Map(rows.map((r) => [r.symbol, r]));
  return (
    <Card>
      <Header />
      <ol className="mt-3 grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
        {picks.picks.map((p, k) => {
          const r = bySymbol.get(p.symbol);
          return (
            <li key={p.symbol} className="bg-surface">
              <Link href={`/stock/${encodeURIComponent(p.symbol)}`} className="flex h-full flex-col gap-1.5 px-4 py-3.5 hover:bg-surface-2/70 sm:px-5">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="num text-xs text-ink-3">{k + 1}</span>
                    <span className="truncate text-[15px] font-medium text-ink">{p.symbol}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-ink-3" title="How confident the AI said it was, 1–5">
                    {"●".repeat(p.confidence)}
                    <span className="opacity-30">{"●".repeat(5 - p.confidence)}</span>
                  </span>
                </span>
                {r?.industry && <span className="truncate text-xs text-ink-3">{r.industry}</span>}
                <span className="text-xs leading-relaxed text-ink-2">{p.reason}</span>
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

export function AiPicksSkeleton() {
  return (
    <Card>
      <Header />
      <ol className="mt-3 grid grid-cols-1 gap-px border-t border-line bg-line sm:grid-cols-2 lg:grid-cols-5" aria-hidden="true">
        {Array.from({ length: 5 }, (_, k) => (
          <li key={k} className="flex flex-col gap-2 bg-surface px-4 py-3.5 sm:px-5">
            <Bone className="h-4 w-24" />
            <Bone className="h-3 w-full" />
            <Bone className="h-3 w-2/3" />
          </li>
        ))}
      </ol>
    </Card>
  );
}
