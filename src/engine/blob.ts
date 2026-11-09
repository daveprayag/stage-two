/**
 * Private Vercel Blob storage for the price store, screens, news and run history.
 * Paths:
 *   prices/latest.json.gz      rolling 300-session price store (prices/previous.json.gz = the day before)
 *   screens/latest.json        latest screen (+ screens/<date>.json, one per session, for the track record)
 *   news/announcements.json    NSE filings, last ~3 weeks, by symbol
 *   runs/log.json              cron history (newest first)
 *   meta/eod.json, meta/filings.json   last check times and the store date, for cheap frequent checks
 */
import { get, put } from "@vercel/blob";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";

export const PATHS = {
  prices: "prices/latest.json.gz",
  pricesPrev: "prices/previous.json.gz",
  screen: "screens/latest.json",
  screenOn: (d: string) => `screens/${d}.json`,
  announcements: "news/announcements.json",
  runs: "runs/log.json",
  /** Small state files so frequent checks never load the big price store. */
  /** Forward track record: each session's picks per list with that day's close. */
  track: "track/picks.json",
  eodState: "meta/eod.json",
  filingsState: "meta/filings.json",
} as const;

async function readBytes(path: string, fresh: boolean): Promise<Uint8Array | null> {
  const res = await get(path, { access: "private", useCache: !fresh });
  if (!res || res.statusCode !== 200) return null;
  return new Uint8Array(await new Response(res.stream).arrayBuffer());
}

export async function readJson<T>(path: string, fresh = false): Promise<T | null> {
  const b = await readBytes(path, fresh);
  if (!b) return null;
  return JSON.parse(path.endsWith(".gz") ? strFromU8(gunzipSync(b)) : strFromU8(b)) as T;
}

export async function writeJson(path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  const body = path.endsWith(".gz") ? gzipSync(strToU8(text), { level: 6 }) : text;
  await put(path, Buffer.from(body), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: path.endsWith(".gz") ? "application/gzip" : "application/json",
    cacheControlMaxAge: 60,
  });
}

/** Per-instance memory cache for page reads (a warm function serves repeat views without re-downloading). */
const memo = new Map<string, { at: number; value: unknown }>();

export async function readCached<T>(path: string, ttlMs = 10 * 60_000): Promise<T | null> {
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await readJson<T>(path);
  if (value !== null) memo.set(path, { at: Date.now(), value });
  return value;
}
