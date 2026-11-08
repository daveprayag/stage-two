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

export const TAG_LABEL: Record<ScreenTag, string> = {
  breakout: "Breaking out",
  setup: "Tight near highs",
  fresh2: "New uptrend",
  leader: "Strongest",
  qualified: "All technical checks",
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
