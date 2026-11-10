/**
 * Stock page pieces shared by the real page and its loading state, so the layout, headings and labels are identical and
 * only the data swaps from placeholders to values.
 */
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import type { ScreenRow, Stage } from "@/engine/types";
import { day } from "@/lib/format";
import { PhaseLabel, phaseDetail, SHOWN_TAGS, StageLabel, StarMark, TAG_LABEL } from "./Badges";
import { Card } from "./Page";
import { Bone } from "./Skeleton";
import { WatchButton } from "./WatchButton";

/** Symbol, star, name, live price and the save button. */
export function StockHeader({
  symbol,
  stars,
  name,
  industry,
  price,
}: {
  symbol: string;
  /** Star checks passed if starred, else null. */
  stars: number | null;
  name: React.ReactNode;
  industry: React.ReactNode;
  price: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Link href="/" className="-ml-1 inline-flex w-fit items-center gap-0.5 text-sm text-ink-2 hover:text-ink">
        <ChevronLeft className="h-4 w-4" /> Screener
      </Link>
      {/* Phones: symbol and save button on one row, price on the next. Wider: all three on one row. */}
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2.5 font-display text-[2.5rem] leading-none tracking-tight sm:text-6xl">
            <span className="truncate">{symbol}</span>
            {stars !== null && <StarMark count={stars} className="h-6 w-6 shrink-0 sm:h-8 sm:w-8" />}
          </h1>
          <div className="mt-2 text-sm text-ink-2">{name}</div>
          <div className="mt-0.5 text-xs text-ink-3">{industry}</div>
        </div>
        <div className="order-last basis-full sm:order-none sm:basis-auto">{price}</div>
        <div className="shrink-0 pt-1 sm:pt-2">
          <WatchButton symbol={symbol} />
        </div>
      </div>
    </div>
  );
}

const STAGE_NOTE: Record<Stage, string> = {
  1: "Basing: moving sideways around a flat 150-day average",
  2: "Uptrend: above a rising 150-day average",
  3: "Topping: the average has flattened after an advance",
  4: "Downtrend: below a falling 150-day average",
};

const PHASE_NOTE = {
  early: "First rally out of its base, the lowest-risk time to buy",
  mid: "Second rally since its base",
  late: "Third rally or later, or after an 80%+ run: extended",
} as const;

function Glance({ label, value, note }: { label: string; value: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3 sm:px-5">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="mt-1 text-[15px] text-ink">{value}</dd>
      {note && <dd className="mt-1 text-xs leading-snug text-ink-3">{note}</dd>}
    </div>
  );
}

/** Trend, phase and lists, each with what it means. row undefined = loading. */
export function StockGlance({ row }: { row: ScreenRow | null | undefined }) {
  if (row === null) return null;
  const grid = "grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3";
  if (row === undefined) {
    return (
      <dl className={grid} aria-hidden="true">
        {["Trend", "Phase", "On lists"].map((l) => (
          <Glance key={l} label={l} value={<Bone className="mt-1 h-4 w-28" />} note={<Bone className="mt-1 h-3 w-48" />} />
        ))}
      </dl>
    );
  }
  const lists = row.tags.filter((t) => SHOWN_TAGS.includes(t));
  const left = row.baseDate && !row.inBase ? ` Left its base after ${day(row.baseDate)}.` : "";
  return (
    <dl className={grid}>
      <Glance
        label="Trend"
        value={
          <span className="inline-flex items-baseline gap-1.5">
            <StageLabel stage={row.stage} />
            {row.stage === 2 && row.stageAge !== null && row.stageAge !== undefined && (
              <span className="text-ink-2">· {row.stageAge >= 120 ? "120+ days" : `${row.stageAge} ${row.stageAge === 1 ? "day" : "days"}`}</span>
            )}
          </span>
        }
        note={STAGE_NOTE[row.stage]}
      />
      <Glance
        label="Phase"
        value={
          row.phase ? (
            <>
              <PhaseLabel phase={row.phase} stage={row.stage} />
              <span className="text-ink-2"> · {phaseDetail(row).replace(/^Just out of base/, "just out of base").replace(/^Rally/, "rally")}</span>
            </>
          ) : (
            <span className="text-ink-3">Not in an uptrend</span>
          )
        }
        note={row.phase ? `${PHASE_NOTE[row.phase]}.${left}` : "Phases are only counted in stage 2."}
      />
      <Glance
        label="On lists"
        value={
          lists.length ? (
            <span className="flex flex-wrap gap-1.5">
              {lists.map((t) => (
                <span key={t} className="rounded-full border border-line px-2 py-0.5 text-xs text-ink-2">
                  {TAG_LABEL[t]}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-ink-3">None today</span>
          )
        }
        note={lists.length ? "The screener lists it's on after the last close" : "Not on Strongest, Momentum leaders or Resuming"}
      />
    </dl>
  );
}

/** The labels of the facts card, in order (the real page fills in the values). */
export const FACT_LABELS = ["RS rating", "From 52-week high", "1 month", "3 months", "10-day range", "Volume 5/50", "Avg daily value", "Next resistance"] as const;

/** Everything below the header while the latest data loads. */
export function StockBodySkeleton() {
  return (
    <>
      <span className="sr-only" role="status">Loading the latest data…</span>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]" aria-hidden="true">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4 sm:p-5">
            <Bone className="h-8 w-full max-w-md" />
            <Bone className="mt-4 h-[300px] w-full sm:h-[380px]" />
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              {FACT_LABELS.map((l) => (
                <div key={l} className="bg-surface px-4 py-2.5 sm:px-5 sm:py-3">
                  <dt className="text-xs text-ink-3">{l}</dt>
                  <dd className="mt-1.5">
                    <Bone className="h-4 w-16" />
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
        <Card>
          <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
            <span className="text-sm text-ink">Star checks</span>
            <Bone className="h-3 w-8" />
          </div>
          <ul className="space-y-4 px-4 py-4 sm:px-5">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="flex gap-3">
                <Bone className="h-4 w-4 shrink-0 rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Bone className="h-4 w-3/4" />
                  <Bone className="h-3 w-1/2" />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-3" aria-hidden="true">
        <Bone className="h-48 rounded-2xl lg:col-span-1" />
        <Bone className="h-48 rounded-2xl lg:col-span-2" />
      </div>
    </>
  );
}
