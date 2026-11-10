/**
 * The star: the Guide's "choosing which stock to buy" steps, checked per stock. A stock is starred when it fits the
 * momentum-leader profile (required) and passes at least STAR_MIN of the six checks. The market check is shown but not
 * counted: it is the same for every stock. Pure; needs the news bundle for the news check.
 */
import type { Check } from "./topsetup";
import type { MarketSnapshot, NewsBundle, ScreenRow } from "./types";

export const STAR_MIN = 5;
export const STAR_MAX_STOP_PCT = 12;
export const STAR_MIN_SECTOR_LEADERS = 3;

export function starChecks(r: ScreenRow, n: NewsBundle | undefined): Check[] {
  const ai = n?.ai;
  const res = r.resume ?? null;
  return [
    { key: "momentum", label: "Momentum leader profile", pass: r.tags.includes("momentum"), value: `RS ${r.rs}, ADR ${(r.adr ?? 0).toFixed(1)}%, ${r.industry ?? "industry unknown"}${r.sectorRank !== null && r.sectorRank !== undefined ? ` (top ${Math.max(1, Math.round((1 - r.sectorRank) * 100))}%)` : ""}, stage ${r.stage}` },
    { key: "phase", label: "Early or mid in its uptrend", pass: r.phase === "early" || r.phase === "mid", value: r.phase ? `${r.phase[0]!.toUpperCase()}${r.phase.slice(1)}` : "Not in stage 2" },
    { key: "rs", label: "RS 90 or more", pass: r.rs >= 90, value: `RS ${r.rs}` },
    {
      key: "group",
      label: "Its sector is moving as a group",
      pass: (r.sectorLeaders ?? 0) >= STAR_MIN_SECTOR_LEADERS,
      value: r.industry ? `${r.sectorLeaders ?? 0} strong stocks (stage 2, RS 80+) in ${r.industry}` : "Industry not classified",
    },
    {
      key: "news",
      label: "Positive news, no red flags",
      // A results-day breakdown counts as a red flag: such stocks kept lagging the index (livermore EXPERIMENTS
      // "Results-day moves": median −5.6 points over 60 sessions).
      pass: !!ai && ai.sentiment === "positive" && ai.redFlags.length === 0 && r.resultsReaction?.kind !== "breakdown",
      value:
        r.resultsReaction?.kind === "breakdown"
          ? `Red flag: fell ${Math.abs(r.resultsReaction.chg).toFixed(1)}% on ${r.resultsReaction.volX.toFixed(1)}× volume after results`
          : !ai
            ? "No news summary"
            : ai.redFlags.length
              ? `Red flag: ${ai.redFlags[0]}`
              : `News ${ai.sentiment}`,
    },
    {
      key: "resume",
      label: `Resuming after a pause, stop within ${STAR_MAX_STOP_PCT}%`,
      pass: !!res && res.stopPct <= STAR_MAX_STOP_PCT,
      value: res
        ? `${res.rallyPct.toFixed(0)}% rally, ${res.pauseBars}-session pause, back above ${res.pivot.toFixed(2)} ${res.daysAgo === 0 ? "today" : `${res.daysAgo} ${res.daysAgo === 1 ? "session" : "sessions"} ago`}; stop at the pause low ${res.pauseLow.toFixed(2)} (${res.stopPct.toFixed(1)}% away)`
        : "Not breaking out of a pause after a rally",
    },
  ];
}

export function starCount(r: ScreenRow, n: NewsBundle | undefined): number {
  return starChecks(r, n).filter((c) => c.pass).length;
}

export const isStar = (r: ScreenRow, n: NewsBundle | undefined) => (r.tags ?? []).includes("momentum") && starCount(r, n) >= STAR_MIN;

export function marketNote(m: MarketSnapshot | null | undefined): Check | null {
  if (!m) return null;
  return {
    key: "market",
    label: "Market: NIFTY 500 above its 200-day average",
    pass: m.aboveSma200,
    value: m.aboveSma200 ? "Yes: normal position sizes" : "No: buy less (the same profile still lost money in 2021–22)",
  };
}
