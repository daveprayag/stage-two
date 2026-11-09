import { Star } from "lucide-react";

/** Small typographic indicators. Colour is carried by a dot or the text itself, not by filled badges. */
import type { NewsVerdict, ScreenTag, Stage } from "@/engine/types";

const STAGE: Record<Stage, { dot: string; text: string; title: string }> = {
  1: { dot: "bg-ink-3", text: "text-ink-2", title: "Basing: price moving sideways around a flat 30-week average" },
  2: { dot: "bg-up", text: "text-up", title: "Advancing: price above a rising 30-week average" },
  3: { dot: "bg-amber", text: "text-amber", title: "Topping: the 30-week average has flattened after an advance" },
  4: { dot: "bg-down", text: "text-down", title: "Declining: price below a falling 30-week average" },
};

export const stageAge = (age: number | null | undefined) => (age === null || age === undefined ? "" : age >= 120 ? "120d+" : `${age}d`);

/** "● Stage 2 · 8d" */
export function StageLabel({ stage, age, className = "" }: { stage: Stage; age?: number | null; className?: string }) {
  const s = STAGE[stage];
  return (
    <span title={s.title} className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      <span className={s.text}>Stage {stage}</span>
      {stage === 2 && age !== null && age !== undefined && <span className="num text-ink-3">{stageAge(age)}</span>}
    </span>
  );
}

const PHASE: Record<"early" | "mid" | "late", { label: string; cls: string; title: string }> = {
  early: { label: "Early", cls: "text-up", title: "Base breakout or first rally of the uptrend" },
  mid: { label: "Mid", cls: "text-ink", title: "Second rally of the uptrend" },
  late: { label: "Late", cls: "text-amber", title: "Third rally or later, or an 80%+ rally: extended" },
};

/** "Early" / "Mid" / "Late" for stage 2 stocks; the stage otherwise. */
export function PhaseLabel({ phase, stage }: { phase: "early" | "mid" | "late" | null | undefined; stage: Stage }) {
  if (!phase) return <span className="text-ink-3">Stage {stage}</span>;
  const p = PHASE[phase];
  return (
    <span title={p.title} className={p.cls}>
      {p.label}
    </span>
  );
}

/** Next to the phase in tight spaces: the rally number, or why a stock is late. */
export function phaseNote(r: { phase?: "early" | "mid" | "late" | null; rallies?: number; riseFromBase?: number | null; largestRallyPct?: number }): string {
  if (!r.phase || r.rallies === undefined) return "";
  if (r.phase === "late") {
    if (r.riseFromBase === null) return "no base";
    if (r.rallies >= 3) return `${r.rallies} rallies`;
    return "80%+ rally";
  }
  return r.rallies ? `rally ${r.rallies}` : "";
}

/** "Rally 1 · +37% above base", "In base", "No base in 14 months". */
export function phaseDetail(r: { rallies?: number; riseFromBase?: number | null; inBase?: boolean; largestRallyPct?: number }): string {
  if (r.rallies === undefined || r.riseFromBase === undefined) return "";
  if (r.riseFromBase === null) return "No base in 14 months";
  if (r.inBase) return "In base";
  return `${r.rallies ? `Rally ${r.rallies}` : "Just out of base"} · +${r.riseFromBase.toFixed(0)}% above base${(r.largestRallyPct ?? 0) >= 80 ? " · an 80%+ rally" : ""}`;
}

/** Short form for tight spaces: "+37%", "In base", "No base". */
export function baseShort(r: { riseFromBase?: number | null; inBase?: boolean }): string {
  if (r.riseFromBase === undefined) return "—";
  if (r.riseFromBase === null) return "No base";
  if (r.inBase) return "In base";
  return `+${r.riseFromBase.toFixed(0)}%`;
}

export const TAG_LABEL: Record<ScreenTag, string> = {
  breakout: "Breaking out",
  setup: "Tight near highs",
  fresh2: "New uptrend",
  leader: "Strongest",
  qualified: "All technical checks",
  momentum: "Momentum leader",
  resuming: "Resuming after a pause",
  ankur: "Ankur scan",
};

const SENT: Record<NewsVerdict["sentiment"], { dot: string; label: string }> = {
  positive: { dot: "bg-up", label: "Positive news" },
  negative: { dot: "bg-down", label: "Negative news" },
  neutral: { dot: "bg-ink-3", label: "Neutral news" },
  none: { dot: "border border-line-strong", label: "No company news" },
};

export function SentimentDot({ s, className = "" }: { s: NewsVerdict["sentiment"]; className?: string }) {
  return <span title={SENT[s].label} aria-label={SENT[s].label} className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${SENT[s].dot} ${className}`} />;
}

/** Holds a marker at the vertical centre of the first line of the text beside it (1lh = one line of that text). */
export function FirstLine({ children }: { children: React.ReactNode }) {
  return <span className="flex h-[1lh] shrink-0 items-center">{children}</span>;
}

export const sentimentLabel = (s: NewsVerdict["sentiment"]) => SENT[s].label;

/** RS number with a thin meter. */
export function RsMeter({ rs }: { rs: number }) {
  const tone = rs >= 90 ? "bg-up" : rs >= 70 ? "bg-blue" : rs >= 40 ? "bg-ink-3" : "bg-down";
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num w-5 text-right text-ink">{rs}</span>
      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${rs}%` }} />
      </span>
    </span>
  );
}

export function Change({ value, digits = 1, className = "" }: { value: number | null | undefined; digits?: number; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={`num text-ink-3 ${className}`}>—</span>;
  return (
    <span className={`num ${value > 0 ? "text-up" : value < 0 ? "text-down" : "text-ink-2"} ${className}`}>
      {value > 0 ? "+" : value < 0 ? "−" : ""}
      {Math.abs(value).toFixed(digits)}%
    </span>
  );
}

/** ★ for stocks that pass the star checks (src/engine/star.ts). */
export function StarMark({ count, className = "h-3.5 w-3.5" }: { count: number; className?: string }) {
  return (
    <span title={`Star: passes ${count} of 6 checks`} aria-label={`Starred, ${count} of 6 checks`} className="inline-flex shrink-0 text-amber">
      <Star className={className} fill="currentColor" strokeWidth={1.5} />
    </span>
  );
}
