import "server-only";
import type { StockDetail } from "@/engine/detail";
import type { DayPerformance, ListPerformance } from "@/engine/track";
import type { Filing, Headline, MarketSnapshot, NewsBundle, RunRecord, ScreenFile, ScreenRow } from "@/engine/types";
import type { LiveFile } from "@/engine/jobs";
import type { LiveQuote } from "@/engine/nse";
import type { AiPick } from "@/engine/aipicks";
import { engine } from "./engine";

/** Everything is computed and stored by the Cloudflare engine (worker/); the site only reads it. */
export const getScreen = async (): Promise<ScreenFile> => {
  const s = await engine<ScreenFile | { error: string }>("/api/screen");
  if (!s || !("rows" in s)) throw new Error("The engine has no screen yet.");
  return s;
};

export interface StockData {
  /** News headlines: the shortlist's, or fetched by the Worker for other stocks. */
  headlines?: Headline[];
  asOf: string;
  detail: StockDetail;
  row: ScreenRow | null;
  news: NewsBundle | null;
  filings: Filing[];
  market: MarketSnapshot | null;
  /** Set when today's AI picks (experiment) include this stock. */
  aiPick?: AiPick | null;
}
export const getStock = (symbol: string) => engine<StockData>(`/api/stock/${encodeURIComponent(symbol)}`);

export const getTrack = () => engine<{ first: string | null; lists: ListPerformance[]; days: DayPerformance[] }>("/api/track");

/** Every stock's live price and every index; null if the engine can't be reached (pages then show no live prices). */
export const getLive = () => engine<LiveFile>("/api/live").catch(() => null);

/** One stock's live quote with intraday high/low; null on failure. */
export const getQuote = (symbol: string) =>
  engine<{ quote: LiveQuote | null; marketOpen: boolean }>(`/api/live/${encodeURIComponent(symbol)}`).catch(() => null);

export const getRuns = () =>
  engine<{ runs: RunRecord[]; eod: { lastCheck: string | null } | null; filings: { lastCheck: string | null } | null; live: { lastRun: string | null } | null }>("/api/runs");
