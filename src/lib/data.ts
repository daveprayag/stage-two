import "server-only";
import { PATHS, readCached } from "@/engine/blob";
import { allRows } from "@/engine/screen";
import type { Filing, PriceStore, RunRecord, ScreenFile, ScreenRow } from "@/engine/types";
import type { TrackEntry } from "@/engine/track";

export const getScreen = () => readCached<ScreenFile>(PATHS.screen, 5 * 60_000);
export const getStore = () => readCached<PriceStore>(PATHS.prices, 30 * 60_000);
export const getSectors = () => readCached<Record<string, string>>(PATHS.sectors, 30 * 60_000);
export const getRuns = () => readCached<RunRecord[]>(PATHS.runs, 60_000);
export const getTrack = () => readCached<TrackEntry[]>(PATHS.track, 5 * 60_000);
export const getEodState = () => readCached<{ asOf: string | null; lastCheck: string | null }>(PATHS.eodState, 60_000);
export const getFilingsState = () => readCached<{ lastCheck: string | null }>(PATHS.filingsState, 60_000);

export async function getFilings(symbol: string): Promise<Filing[]> {
  const ann = await readCached<{ bySymbol: Record<string, Filing[]> }>(PATHS.announcements, 30 * 60_000);
  return ann?.bySymbol[symbol] ?? [];
}

let rowsMemo: { asOf: string; rows: Map<string, ScreenRow> } | null = null;
/** Every liquid stock's screen row (RS, stage, template), memoised per session. */
export async function getAllRows(): Promise<Map<string, ScreenRow>> {
  const [store, sectors] = await Promise.all([getStore(), getSectors()]);
  if (!store) return new Map();
  if (rowsMemo?.asOf !== store.asOf) rowsMemo = { asOf: store.asOf, rows: allRows(store, sectors ?? undefined) };
  return rowsMemo.rows;
}
