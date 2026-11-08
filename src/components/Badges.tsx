import type { NewsVerdict, ScreenTag, Stage } from "@/engine/types";

const STAGE: Record<Stage, { label: string; cls: string; title: string }> = {
  1: { label: "Stage 1", cls: "bg-surface-2 text-ink-2", title: "Basing: price moving sideways around a flat 30-week average" },
  2: { label: "Stage 2", cls: "bg-up-soft text-up", title: "Advancing: price above a rising 30-week average" },
  3: { label: "Stage 3", cls: "bg-amber-soft text-amber", title: "Topping: the 30-week average has flattened after an advance" },
  4: { label: "Stage 4", cls: "bg-down-soft text-down", title: "Declining: price below a falling 30-week average" },
};

export function StagePill({ stage, age }: { stage: Stage; age?: number | null }) {
  const s = STAGE[stage];
  return (
    <span title={s.title} className={`num inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${s.cls}`}>
      {s.label}
      {stage === 2 && age !== null && age !== undefined && <span className="opacity-70">· {age >= 120 ? "120d+" : `${age}d`}</span>}
    </span>
  );
}

export const TAG_META: Record<ScreenTag, { label: string; cls: string }> = {
  breakout: { label: "Breakout", cls: "bg-up text-white dark:text-bg" },
  setup: { label: "Setting up", cls: "bg-amber-soft text-amber" },
  fresh2: { label: "Fresh stage 2", cls: "bg-blue-soft text-blue" },
  leader: { label: "Leader", cls: "bg-violet-soft text-violet" },
  ankur: { label: "Ankur scan", cls: "bg-surface-2 text-ink-2" },
};

export function TagBadge({ tag }: { tag: ScreenTag }) {
  const m = TAG_META[tag];
  return <span className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap ${m.cls}`}>{m.label}</span>;
}

const SENT: Record<NewsVerdict["sentiment"], { cls: string; label: string }> = {
  positive: { cls: "bg-up", label: "Positive news" },
  negative: { cls: "bg-down", label: "Negative news" },
  neutral: { cls: "bg-ink-3", label: "Neutral news" },
  none: { cls: "border border-line-strong", label: "No company news" },
};

export function SentimentDot({ s }: { s: NewsVerdict["sentiment"] }) {
  return <span title={SENT[s].label} aria-label={SENT[s].label} className={`inline-block h-2 w-2 shrink-0 rounded-full ${SENT[s].cls}`} />;
}

export function sentimentLabel(s: NewsVerdict["sentiment"]) {
  return SENT[s].label;
}

/** Small horizontal bar for a 0–99 score. */
export function RsBar({ rs }: { rs: number }) {
  const tone = rs >= 90 ? "bg-up" : rs >= 70 ? "bg-blue" : rs >= 40 ? "bg-ink-3" : "bg-down";
  return (
    <span className="flex items-center gap-2">
      <span className="num w-6 text-right">{rs}</span>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${rs}%` }} />
      </span>
    </span>
  );
}
