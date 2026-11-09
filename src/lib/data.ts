import "server-only";
import type { StockDetail } from "@/engine/detail";
import type { DayPerformance, ListPerformance } from "@/engine/track";
import type { Filing, MarketSnapshot, NewsBundle, RunRecord, ScreenFile, ScreenRow } from "@/engine/types";
import { engine } from "./engine";

/** Everything is computed and stored by the Cloudflare engine (worker/); the site only reads it. */
export const getScreen = () => engine<ScreenFile>("/api/screen", 300);

export interface StockData {
  asOf: string;
  detail: StockDetail;
  row: ScreenRow | null;
  news: NewsBundle | null;
  filings: Filing[];
  market: MarketSnapshot | null;
}
export const getStock = (symbol: string) => engine<StockData>(`/api/stock/${encodeURIComponent(symbol)}`, 600);

export const getTrack = () => engine<{ first: string | null; lists: ListPerformance[]; days: DayPerformance[] }>("/api/track", 300);

export const getRuns = () =>
  engine<{ runs: RunRecord[]; eod: { lastCheck: string | null } | null; filings: { lastCheck: string | null } | null; live: { lastRun: string | null } | null }>("/api/runs", 30);
