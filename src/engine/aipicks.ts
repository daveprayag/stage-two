/**
 * AI picks: an experiment. Each evening an AI model reads the Strongest and Momentum leaders lists (numbers, news
 * summary, results reaction) and picks the 5 it thinks most likely to outperform over the next 3 months. The picks are
 * recorded in the track record next to the lists; they change no rule, check or star. Promote or drop after 3–6 months.
 * The model's training data may include market history, so only the forward record counts (no backtest is possible).
 */
import { askModel, type GeminiConfig } from "./news";
import type { ISODate, NewsBundle, ScreenFile, ScreenRow } from "./types";

export interface AiPick {
  symbol: string;
  reason: string;
  /** 1 (low) – 5 (high), as the model rated it. */
  confidence: number;
}

export interface AiPicks {
  asOf: ISODate;
  at: string;
  /** Which model answered (internal; not shown on the site). */
  model: string;
  /** Why stronger models were passed over, if any (internal). */
  skipped?: string[];
  picks: AiPick[];
}

/**
 * One request a day, so the stronger Flash models only (free tier): 3.6 Flash (stable) first, then 3.8 Flash. No light
 * model: if both are busy, this run makes no picks and the next evening run (every 15 min) tries again.
 */
export const AI_PICKS_MODELS = "gemini-3.6-flash,gemini-3.8-flash";
export const AI_PICKS_COUNT = 5;
const MAX_CANDIDATES = 80;

/** Strongest ∪ Momentum leaders, best screener score first. */
export function candidatesFor(rows: ScreenRow[]): ScreenRow[] {
  return rows
    .filter((r) => r.tags.includes("leader") || r.tags.includes("momentum"))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

/** "rally 1, +37% above base" / "in base" / "no base in 14 months". */
function phaseDetail(r: ScreenRow): string {
  if (r.riseFromBase === null) return "no base in 14 months";
  if (r.inBase) return "in base";
  return `${r.rallies ? `rally ${r.rallies}` : "just out of base"}, +${r.riseFromBase.toFixed(0)}% above base${r.largestRallyPct >= 80 ? ", had an 80%+ rally" : ""}`;
}

const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined || !Number.isFinite(x) ? "?" : `${x > 0 ? "+" : ""}${x.toFixed(d)}%`);

function line(r: ScreenRow, n: NewsBundle | undefined): string {
  const parts = [
    `${r.symbol} (${r.industry ?? "sector unknown"}${r.sectorRank !== null ? `, sector in the top ${Math.max(1, Math.round((1 - r.sectorRank) * 100))}% by 3-month return, ${r.sectorLeaders} strong stocks in it` : ""})`,
    `RS ${r.rs}`,
    `stage ${r.stage}${r.stageAge !== null ? ` for ${r.stageAge >= 120 ? "120+" : r.stageAge} days` : ""}${r.phase ? `, ${r.phase} phase (${phaseDetail(r)})` : ""}`,
    `returns 1m ${pct(r.ret1m)}, 3m ${pct(r.ret3m)}, 6m ${pct(r.ret6m)}`,
    `${r.pctFromHigh.toFixed(1)}% below 52-week high`,
    `daily range (ADR) ${(r.adr ?? 0).toFixed(1)}%`,
    `10-day range ${r.tight10.toFixed(1)}%`,
    `volume 5/50 ${r.dryUp.toFixed(2)}, up/down volume ${r.upDownVol?.toFixed(2) ?? "?"}`,
    r.resume ? `resuming after a ${r.resume.pauseBars}-session pause, stop ${r.resume.stopPct.toFixed(1)}% away` : "",
    r.resultsReaction && r.resultsReaction.kind !== "neutral"
      ? `results ${r.resultsReaction.date}: ${pct(r.resultsReaction.chg, 1)} on ${r.resultsReaction.volX.toFixed(1)}x volume`
      : "",
    r.resultsOn ? `results due ${r.resultsOn}` : "",
    n?.ai ? `news ${n.ai.sentiment}: ${n.ai.summary}${n.ai.redFlags.length ? ` RED FLAGS: ${n.ai.redFlags.join("; ")}` : ""}` : "no news summary",
  ];
  return `- ${parts.filter(Boolean).join(" | ")}`;
}

export function picksPrompt(asOf: ISODate, rows: ScreenRow[], news: Record<string, NewsBundle>): string {
  return `You are helping a swing trader who buys Indian (NSE) stocks and holds them for weeks to months, with a stop-loss.
Below are ${rows.length} stocks from a momentum screener after the close of ${asOf}: each is in the top 10% by 12-month
relative strength or fits a momentum-leader profile. Using ONLY the data given (no outside knowledge of prices after
${asOf}), pick the ${AI_PICKS_COUNT} you judge most likely to beat the NIFTY 500 over the next 3 months.

Weigh trend quality and stage, how extended the stock already is, sector strength, volatility, volume behaviour,
news quality and red flags, and upcoming or recent results. Avoid stocks with red flags. Pick no more than 2 from the
same sector. For each pick give a reason of at most 25 words citing the data, and a confidence from 1 (low) to 5 (high).

Stocks:
${rows.map((r) => line(r, news[r.symbol])).join("\n")}`;
}

const SCHEMA = {
  type: "OBJECT",
  properties: {
    picks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { symbol: { type: "STRING" }, reason: { type: "STRING" }, confidence: { type: "INTEGER" } },
        required: ["symbol", "reason", "confidence"],
      },
    },
  },
  required: ["picks"],
};

/** Keep only valid, unique candidates, at most AI_PICKS_COUNT. */
export function cleanPicks(raw: unknown, allowed: Set<string>): AiPick[] {
  const list = (raw as { picks?: unknown[] } | null)?.picks ?? [];
  const out: AiPick[] = [];
  for (const p of list as Record<string, unknown>[]) {
    const symbol = String(p?.["symbol"] ?? "").trim().toUpperCase();
    if (!allowed.has(symbol) || out.some((x) => x.symbol === symbol)) continue;
    const c = Math.round(Number(p["confidence"]));
    out.push({ symbol, reason: String(p["reason"] ?? "").trim().slice(0, 240), confidence: Number.isFinite(c) ? Math.min(5, Math.max(1, c)) : 3 });
    if (out.length === AI_PICKS_COUNT) break;
  }
  return out;
}

/** One AI request → today's picks (null if no candidates). Throws if no model answers. */
export async function makeAiPicks(screen: ScreenFile, cfg: GeminiConfig, models = AI_PICKS_MODELS): Promise<AiPicks | null> {
  const rows = candidatesFor(screen.rows);
  if (!rows.length) return null;
  const { text, model, skipped } = await askModel(picksPrompt(screen.asOf, rows, screen.news), SCHEMA, cfg, { models, timeoutMs: 150_000, temperature: 0, attempts: 3, waitMs: 15_000 });
  const picks = cleanPicks(JSON.parse(text || "{}"), new Set(rows.map((r) => r.symbol)));
  return { asOf: screen.asOf, at: new Date().toISOString(), model, ...(skipped.length ? { skipped } : {}), picks };
}
