import { Star } from "lucide-react";

/** Small typographic indicators. Colour is carried by a dot or the text itself, not by filled badges. */
import type { NewsVerdict, ScreenRow, ScreenTag, Stage } from "@/engine/types";
import { price } from "@/lib/format";

const STAGE: Record<Stage, { dot: string; text: string; title: string }> = {
  1: { dot: "bg-ink-3", text: "text-ink-2", title: "Basing: price moving sideways around a flat 150-day EMA" },
  2: { dot: "bg-up", text: "text-up", title: "Advancing: price above a rising 150-day EMA" },
  3: { dot: "bg-amber", text: "text-amber", title: "Topping: the 150-day EMA has flattened after an advance" },
  4: { dot: "bg-down", text: "text-down", title: "Declining: price below a falling 150-day EMA" },
};

export const stageAge = (age: number | null | undefined) => (age === null || age === undefined ? "" : age >= 120 ? "120d+" : `${age}d`);

/** "● Stage 2 · 8d", or with `detail` "● Stage 2 · 120+ days". */
export function StageLabel({ stage, age, detail, className = "" }: { stage: Stage; age?: number | null; detail?: string; className?: string }) {
  const s = STAGE[stage];
  return (
    <span title={s.title} className={`inline-flex items-center gap-1.5 whitespace-nowrap ${className}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.dot}`} />
      <span className={s.text}>Stage {stage}</span>
      {detail ? (
        <span className="text-ink-2">· {detail}</span>
      ) : (
        stage === 2 && age !== null && age !== undefined && <span className="num text-ink-3">{stageAge(age)}</span>
      )}
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

/** % above the 52-week low below which a stage 2 stock counts as in the first leg of its rise (display and filter only). */
export const FIRST_LEG_PCT = 50;
export const isFirstLeg = (r: { stage?: Stage; pctAboveLow?: number }) => r.stage === 2 && r.pctAboveLow !== undefined && r.pctAboveLow < FIRST_LEG_PCT;
/**
 * The phase restarts at every new base, so "early" can follow a doubling. In stage 2: "first leg" while the stock is
 * under 50% above its 52-week low, otherwise how far it already stands above that low ("after +105%").
 */
export function legNote(r: { stage?: Stage; phase?: "early" | "mid" | "late" | null; pctAboveLow?: number }): string {
  if (r.stage !== 2 || !r.phase || r.phase === "late" || r.pctAboveLow === undefined) return "";
  return isFirstLeg(r) ? "first leg" : `after +${r.pctAboveLow.toFixed(0)}%`;
}

/** Next to the phase in tight spaces: the rally number, or why a stock is late. */
export function phaseNote(r: { phase?: "early" | "mid" | "late" | null; rallies?: number; riseFromBase?: number | null; largestRallyPct?: number; stage?: Stage; pctAboveLow?: number }): string {
  if (!r.phase || r.rallies === undefined) return "";
  if (r.phase === "late") {
    if (r.riseFromBase === null) return "no base";
    if (r.rallies >= 3) return `${r.rallies} rallies`;
    return "80%+ rally";
  }
  return [r.rallies ? `rally ${r.rallies}` : "", legNote(r)].filter(Boolean).join(" · ");
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

/** The lists the screener shows; other tags are still computed and tracked but not shown. */
export const SHOWN_TAGS: readonly ScreenTag[] = ["leader", "momentum", "resuming"];

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

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-11-12" → "12 Nov". */
export const shortDay = (d: string) => `${Number(d.slice(8, 10))} ${MON[Number(d.slice(5, 7)) - 1]}`;

/** Calendar days from today (IST) to an ISO date. */
export function daysUntil(d: string, now = Date.now()): number {
  const today = new Date(now + 330 * 60_000).toISOString().slice(0, 10);
  return Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
}

/** Results due within 7 days → true. */
export const resultsSoon = (r: { resultsOn?: string | null }, now = Date.now()) => !!r.resultsOn && daysUntil(r.resultsOn, now) <= 7 && daysUntil(r.resultsOn, now) >= 0;

/**
 * Small pill after a symbol: results due within a week (amber), or a strong reaction to the latest results within the
 * last 10 sessions (green breakout / red breakdown). Nothing otherwise.
 */
export function ResultsBadge({ r }: { r: { resultsOn?: string | null; resultsReaction?: { kind: string; chg: number; volX: number; date: string } | null } }) {
  const x = r.resultsReaction;
  if (x && x.kind !== "neutral") {
    const up = x.kind === "breakout";
    return (
      <span
        title={`${up ? "Broke out" : "Broke down"} on results (${shortDay(x.date)}): ${x.chg > 0 ? "+" : ""}${x.chg.toFixed(1)}% on ${x.volX.toFixed(1)}× volume`}
        className={`shrink-0 rounded-full border px-1.5 py-px text-[10px] leading-4 ${up ? "border-up/40 text-up" : "border-down/40 text-down"}`}
      >
        Results {up ? "▲" : "▼"}
      </span>
    );
  }
  if (r.resultsOn && resultsSoon(r)) {
    const n = daysUntil(r.resultsOn);
    return (
      <span
        title={`Quarterly results due ${shortDay(r.resultsOn)}${n === 0 ? " (today)" : n === 1 ? " (tomorrow)" : ` (in ${n} days)`}: expect a big move either way`}
        className="shrink-0 rounded-full border border-amber/50 px-1.5 py-px text-[10px] leading-4 text-amber"
      >
        Results {n === 0 ? "today" : shortDay(r.resultsOn)}
      </span>
    );
  }
  return null;
}

/** 3-month return (%) from which a stock is marked "Extended" (the 2016–24 top fifth of Momentum leaders; display only). */
export const EXTENDED_PCT = 70;
export const isExtended = (r: { ret3m?: number | null }) => r.ret3m !== null && r.ret3m !== undefined && r.ret3m >= EXTENDED_PCT;
/**
 * What the data says about stocks up 70%+ in 3 months (livermore research/winners/extnote.py, pre-registered 2026-11-11,
 * every day on Momentum leaders, next 6 months).
 */
export const EXTENDED_NOTE =
  "Up 70%+ in 3 months. Momentum leaders this extended ended the next 6 months 20%+ lower more often than the rest: 20% vs 13% in 2012–15, 17% vs 14% in 2016–24, 34% vs 23% in 2025–26. Their average return was as good or better before 2025 and lower in 2025–26. Expect bigger swings: use a wider stop and a smaller position.";

/** Quiet pill after a symbol for a stock up 70%+ in 3 months; nothing otherwise. */
export function ExtendedBadge({ r }: { r: { ret3m?: number | null } }) {
  if (!isExtended(r)) return null;
  return (
    <span title={EXTENDED_NOTE} className="shrink-0 rounded-full border border-down/35 px-1.5 py-px text-[10px] leading-4 text-ink-2">
      Extended
    </span>
  );
}

/** Momentum leaders stretch: "Since 11 Aug · +38%" (short) or "On Momentum leaders since 11 Aug at ₹177, +38% since" (long). */
export function sinceText(r: Pick<ScreenRow, "momentumSince" | "close">, long = false, now?: number | null): string | null {
  const s = r.momentumSince;
  if (!s) return null;
  const last = now ?? r.close;
  const pct = s.close ? (last / s.close - 1) * 100 : null;
  const whole = pct === null ? null : Math.round(pct);
  const chg = whole === null ? "" : `${whole >= 0 ? "+" : "−"}${Math.abs(whole)}%`;
  const when = `${shortDay(s.date)}${s.orEarlier ? " or earlier" : ""}`;
  if (!long) return `Since ${when}${chg ? ` · ${chg}` : ""}`;
  return `On Momentum leaders since ${when}${s.close ? ` at ₹${price(s.close)}` : ""}${chg ? `, ${chg} since` : ""}`;
}
