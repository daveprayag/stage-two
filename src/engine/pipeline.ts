/**
 * Scheduled jobs. A Cloudflare Worker (worker/) calls them often; a daily Vercel Cron (vercel.json) is the backup.
 *  - runEod:     every 15 min in the evening. Cheap check first (one HEAD request to NSE); only when a new session's
 *                bhavcopy exists does it load the price store, add the session and recompute the screen.
 *  - runNews:    after a new screen: filings, Google News headlines and Gemini summaries for the shortlist.
 *  - runFilings: every 30 min in market hours: new NSE filings; re-summarises only shortlisted stocks that got one.
 * All are idempotent and throttled (a minimum gap between runs), so calling them too often does no harm.
 * Runs that had nothing to do are not written to the history.
 */
import { PATHS, readJson, writeJson } from "./blob";
import { fetchHeadlines, verdicts } from "./news";
import {
  announcementsUrl, bhavcopyUrl, corpActionsUrl, indexCloseUrl, parseAnnouncements, parseBhavcopyZip,
  parseCorpActions, parseIndexClose, parseNseDate, parsePriceBands, parseSector, politeGet, politeHead, priceBandUrl, sectorUrl,
  type CorpAction,
} from "./nse";
import { computeScreen, type Sectors } from "./screen";
import type { Filing, ISODate, NewsBundle, PriceStore, RunRecord, ScreenFile, ScreenRow } from "./types";
import { appendSession } from "./update";
import { picksFor, upsertEntry, type TrackEntry } from "./track";

const IST_OFFSET_MS = 5.5 * 3600_000;
const MIN_EOD_GAP_MS = 5 * 60_000;
const MIN_FILINGS_GAP_MS = 20 * 60_000;

export function istNow(now = Date.now()): { date: ISODate; hour: number } {
  const d = new Date(now + IST_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export interface JobOptions {
  force?: boolean;
  source?: string;
}

interface EodState {
  asOf: ISODate | null;
  lastCheck: string | null;
}

interface FilingsState {
  lastCheck: string | null;
}

const ago = (iso: string | null | undefined) => (iso ? Date.now() - Date.parse(iso) : Number.POSITIVE_INFINITY);

async function appendRun(rec: RunRecord): Promise<void> {
  if (rec.skipped) return;
  const runs = (await readJson<RunRecord[]>(PATHS.runs, true)) ?? [];
  runs.unshift(rec);
  await writeJson(PATHS.runs, runs.slice(0, 400));
}

async function finish(rec: Omit<RunRecord, "finishedAt">): Promise<RunRecord> {
  const done: RunRecord = { ...rec, finishedAt: new Date().toISOString() };
  await appendRun(done).catch(() => undefined);
  return done;
}

const LABELS_PER_RUN = 30;

/** Label up to LABELS_PER_RUN unlabelled EQ stocks (new listings) with NSE's sector; returns the updated map. */
async function labelNewStocks(store: PriceStore, log: string[]): Promise<Sectors> {
  const sectors = (await readJson<Sectors>(PATHS.sectors, true)) ?? {};
  const todo = Object.values(store.stocks).filter((s) => s.series === "EQ" && !sectors[s.symbol]).map((s) => s.symbol).slice(0, LABELS_PER_RUN);
  let added = 0;
  for (const symbol of todo) {
    try {
      const raw = await politeGet(sectorUrl(symbol), "application/json", 1);
      const sector = raw ? parseSector(JSON.parse(new TextDecoder().decode(raw))) : null;
      // "" marks a symbol NSE has no sector for, so it is not asked again every night.
      sectors[symbol] = sector ?? "";
      if (sector) added++;
    } catch {
      // try again next run
    }
  }
  if (todo.length) {
    await writeJson(PATHS.sectors, sectors);
    log.push(`sectors: ${added} of ${todo.length} unlabelled stocks labelled`);
  }
  return sectors;
}

/** Save the session's picks to the forward track record (replacing an earlier save for the same session). */
async function recordPicks(screen: ScreenFile, log: string[]): Promise<void> {
  const entries = (await readJson<TrackEntry[]>(PATHS.track, true)) ?? [];
  const e = picksFor(screen);
  await writeJson(PATHS.track, upsertEntry(entries, e));
  log.push(`track record: ${Object.entries(e.lists).map(([k, v]) => `${k} ${v?.length ?? 0}`).join(", ")}`);
}

async function text(url: string): Promise<string | null> {
  const b = await politeGet(url);
  return b ? new TextDecoder().decode(b) : null;
}

/** Sessions to look for: every calendar day after `asOf` up to today (IST), at most `max`. */
function pendingDays(asOf: ISODate, max = 10): ISODate[] {
  const today = istNow().date;
  const days: ISODate[] = [];
  for (let d = addDays(asOf, 1); d <= today && days.length < max; d = addDays(d, 1)) days.push(d);
  return days;
}

export async function runEod(opts: JobOptions = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const base = { job: "eod" as const, startedAt, ...(opts.source ? { source: opts.source } : {}) };
  const log: string[] = [];
  try {
    const state = (await readJson<EodState>(PATHS.eodState, true)) ?? { asOf: null, lastCheck: null };
    if (!opts.force && ago(state.lastCheck) < MIN_EOD_GAP_MS) {
      return finish({ ...base, ok: true, skipped: true, detail: "checked less than 5 minutes ago", log });
    }
    await writeJson(PATHS.eodState, { ...state, lastCheck: startedAt });
    // Cheap path: is there a new bhavcopy at all? One HEAD request per pending day, no big downloads.
    if (state.asOf && !opts.force) {
      const days = pendingDays(state.asOf);
      let found = false;
      for (const d of days) {
        if (await politeHead(bhavcopyUrl(d)).catch(() => false)) {
          found = true;
          break;
        }
      }
      if (!found) return finish({ ...base, ok: true, skipped: true, detail: days.length ? `no new NSE file yet (${days.join(", ")})` : "up to date", log });
    }

    const store = await readJson<PriceStore>(PATHS.prices, true);
    if (!store) throw new Error("no price store in Blob (run scripts/bootstrap.mts first)");
    const before = JSON.parse(JSON.stringify(store)) as PriceStore;
    const now = istNow();
    const days = pendingDays(store.asOf);
    log.push(`store as of ${store.asOf}; IST now ${now.date} ${now.hour}h; checking ${days.join(", ") || "nothing"}`);

    let corp: CorpAction[] | undefined;
    if (days.length) {
      try {
        const raw = await politeGet(corpActionsUrl(days[0] as ISODate, days[days.length - 1] as ISODate), "application/json");
        corp = raw ? parseCorpActions(JSON.parse(new TextDecoder().decode(raw))) : [];
        log.push(`corporate actions: ${corp.length} records`);
      } catch (e) {
        log.push(`corporate actions unavailable (${String(e)}); using the price-gap check`);
      }
    }
    const added: ISODate[] = [];
    for (const d of days) {
      const zip = await politeGet(bhavcopyUrl(d), "application/zip,*/*");
      if (!zip) {
        log.push(d === now.date ? `${d}: bhavcopy not published yet` : `${d}: no session (holiday or weekend)`);
        continue;
      }
      const { rows } = parseBhavcopyZip(new Uint8Array(zip));
      if (rows.length < 500) {
        log.push(`${d}: only ${rows.length} rows, skipped`);
        continue;
      }
      const idxText = await text(indexCloseUrl(d));
      const bandText = await text(priceBandUrl(d)).catch(() => null);
      const lines = appendSession(store, {
        date: d,
        rows,
        indexCloses: idxText ? parseIndexClose(idxText) : new Map(),
        ...(bandText ? { bands: parsePriceBands(bandText) } : {}),
        ...(corp ? { corpActions: corp } : {}),
      });
      log.push(...lines.slice(0, 40));
      added.push(d);
    }
    if (added.length || opts.force) {
      if (added.length) {
        await writeJson(PATHS.pricesPrev, before);
        await writeJson(PATHS.prices, store);
      }
      const sectors = await labelNewStocks(store, log).catch(() => ({}) as Sectors);
      const screen: ScreenFile = { ...computeScreen(store, sectors), news: {}, newsAt: null };
      await writeJson(PATHS.screen, screen);
      await writeJson(PATHS.screenOn(screen.asOf), screen);
      log.push(`screen ${screen.asOf}: ${screen.rows.length} rows`);
      if (added.length) await recordPicks(screen, log);
    }
    await writeJson(PATHS.eodState, { asOf: store.asOf, lastCheck: startedAt });
    if (!added.length && !opts.force) return finish({ ...base, ok: true, skipped: true, detail: "no new session", log });
    return finish({ ...base, ok: true, detail: added.length ? `added ${added.join(", ")}` : `screen rebuilt for ${store.asOf}`, log });
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
    return finish({ ...base, ok: false, detail, log });
  }
}

interface AnnouncementStore {
  updated: string;
  bySymbol: Record<string, Filing[]>;
}

const filingKey = (x: Filing) => `${x.date}|${x.category}|${x.text}`;

/** Fetch NSE filings since `from`, merge into the rolling 21-day store; returns the symbols that got new ones. */
async function refreshFilings(from: ISODate, cutoffFrom: ISODate, log: string[]): Promise<{ ann: AnnouncementStore; changed: Set<string> }> {
  const ann = (await readJson<AnnouncementStore>(PATHS.announcements, true)) ?? { updated: "", bySymbol: {} };
  const changed = new Set<string>();
  try {
    const raw = await politeGet(announcementsUrl(from, istNow().date), "application/json");
    const fresh = raw ? parseAnnouncements(JSON.parse(new TextDecoder().decode(raw))) : [];
    for (const a of fresh) {
      const list = (ann.bySymbol[a.symbol] ??= []);
      const f: Filing = { date: a.date, category: a.category, text: a.text, url: a.url };
      if (!list.some((x) => filingKey(x) === filingKey(f))) {
        list.push(f);
        changed.add(a.symbol);
      }
    }
    const cutoff = addDays(cutoffFrom, -21);
    for (const [sym, list] of Object.entries(ann.bySymbol)) {
      const kept = list
        .filter((x) => (parseNseDate(x.date) ?? "") >= cutoff)
        .sort((a, b) => ((parseNseDate(b.date) ?? "") < (parseNseDate(a.date) ?? "") ? -1 : (parseNseDate(b.date) ?? "") > (parseNseDate(a.date) ?? "") ? 1 : b.date.localeCompare(a.date)));
      if (kept.length) ann.bySymbol[sym] = kept.slice(0, 15);
      else delete ann.bySymbol[sym];
    }
    ann.updated = new Date().toISOString();
    await writeJson(PATHS.announcements, ann);
    log.push(`NSE filings: ${fresh.length} fetched, ${changed.size} symbols with new ones`);
  } catch (e) {
    log.push(`NSE filings unavailable: ${String(e)}`);
  }
  return { ann, changed };
}

/** Shortlist for news: top-setup candidates, then momentum leaders, breakouts and setups, then the rest by score; at most `max`. */
export function newsShortlist(rows: ScreenRow[], max = 60): ScreenRow[] {
  const rank = (r: ScreenRow) =>
    (r.tags.includes("qualified") ? 8 : 0) + (r.tags.includes("momentum") ? 6 : 0) +
    (r.tags.includes("breakout") ? 4 : 0) + (r.tags.includes("setup") ? 3 : 0) + (r.tags.includes("fresh2") ? 2 : 0) + (r.tags.includes("leader") ? 1 : 0);
  return [...rows].sort((a, b) => rank(b) - rank(a) || b.score - a.score).slice(0, max);
}

/** Gemini summaries for `rows` (batches of `size` in parallel, then a retry pass in sixes for any still missing). */
async function summarise(rows: ScreenRow[], news: Record<string, NewsBundle>, log: string[], replace = false): Promise<number> {
  let n = 0;
  const done = new Set<string>();
  const ask = async (list: ScreenRow[], size: number) => {
    const batches: ScreenRow[][] = [];
    for (let k = 0; k < list.length; k += size) batches.push(list.slice(k, k + size));
    const results = await Promise.allSettled(
      batches.map((b) => verdicts(b.map((row) => ({ row, filings: news[row.symbol]?.filings ?? [], headlines: news[row.symbol]?.headlines ?? [] })))),
    );
    for (const res of results) {
      if (res.status === "rejected") {
        log.push(`Gemini batch failed: ${String(res.reason).slice(0, 200)}`);
        continue;
      }
      for (const [sym, v] of Object.entries(res.value)) {
        const b = news[sym];
        if (b && !done.has(sym) && (replace || !b.ai)) {
          b.ai = v;
          done.add(sym);
          n++;
        }
      }
    }
  };
  await ask(rows, 12);
  const missing = rows.filter((r) => !done.has(r.symbol));
  if (missing.length) await ask(missing, 6);
  return n;
}

export async function runNews(opts: JobOptions & { max?: number; backDays?: number } = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const base = { job: "news" as const, startedAt, ...(opts.source ? { source: opts.source } : {}) };
  const log: string[] = [];
  try {
    const screen = await readJson<ScreenFile>(PATHS.screen, true);
    if (!screen) throw new Error("no screen yet");
    if (screen.newsAt && !opts.force) return finish({ ...base, ok: true, skipped: true, detail: `news already added for ${screen.asOf}`, log });

    // First run: backfill three weeks; afterwards the last three days (filings land after hours and on weekends).
    const existing = await readJson<AnnouncementStore>(PATHS.announcements, true);
    const back = opts.backDays ?? (existing && Object.keys(existing.bySymbol).length ? 3 : 21);
    const { ann } = await refreshFilings(addDays(screen.asOf, -back), screen.asOf, log);

    const shortlist = newsShortlist(screen.rows, opts.max ?? 60);
    const news: Record<string, NewsBundle> = {};
    // Google News, four requests at a time.
    for (let k = 0; k < shortlist.length; k += 4) {
      const part = shortlist.slice(k, k + 4);
      const got = await Promise.all(part.map((r) => fetchHeadlines(r.name, r.symbol).catch(() => [])));
      part.forEach((r, j) => {
        news[r.symbol] = { filings: (ann.bySymbol[r.symbol] ?? []).slice(0, 6), headlines: got[j] ?? [], ai: null };
      });
      await new Promise((res) => setTimeout(res, 200));
    }
    log.push(`headlines for ${shortlist.length} stocks`);
    const n = await summarise(shortlist, news, log);
    log.push(`AI summaries for ${n} stocks`);
    // Re-read in case the eod job replaced the screen meanwhile; only attach to the same session.
    const latest = (await readJson<ScreenFile>(PATHS.screen, true)) ?? screen;
    if (latest.asOf !== screen.asOf) throw new Error(`screen changed to ${latest.asOf} while fetching news for ${screen.asOf}`);
    latest.news = news;
    latest.newsAt = new Date().toISOString();
    await writeJson(PATHS.screen, latest);
    await writeJson(PATHS.screenOn(latest.asOf), latest);
    await writeJson(PATHS.filingsState, { lastCheck: latest.newsAt } satisfies FilingsState);
    // Top setups need the news, so the session's picks are saved again now that it is in.
    await recordPicks(latest, log);
    return finish({ ...base, ok: true, detail: `news for ${shortlist.length} stocks (${n} with AI summaries), session ${latest.asOf}`, log });
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
    return finish({ ...base, ok: false, detail, log });
  }
}

export async function runFilings(opts: JobOptions = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const base = { job: "filings" as const, startedAt, ...(opts.source ? { source: opts.source } : {}) };
  const log: string[] = [];
  try {
    const state = (await readJson<FilingsState>(PATHS.filingsState, true)) ?? { lastCheck: null };
    if (!opts.force && ago(state.lastCheck) < MIN_FILINGS_GAP_MS) {
      return finish({ ...base, ok: true, skipped: true, detail: "checked less than 20 minutes ago", log });
    }
    await writeJson(PATHS.filingsState, { lastCheck: startedAt } satisfies FilingsState);
    const screen = await readJson<ScreenFile>(PATHS.screen, true);
    if (!screen?.newsAt) return finish({ ...base, ok: true, skipped: true, detail: "waiting for the news job", log });

    const { ann, changed } = await refreshFilings(addDays(istNow().date, -1), screen.asOf, log);
    const targets = screen.rows.filter((r) => screen.news[r.symbol] && changed.has(r.symbol));
    if (!targets.length) return finish({ ...base, ok: true, skipped: true, detail: "no new filings for shortlisted stocks", log });
    for (const r of targets) {
      const b = screen.news[r.symbol] as NewsBundle;
      b.filings = (ann.bySymbol[r.symbol] ?? []).slice(0, 6);
    }
    const n = await summarise(targets, screen.news, log, true);
    const latest = (await readJson<ScreenFile>(PATHS.screen, true)) ?? screen;
    if (latest.asOf !== screen.asOf) throw new Error(`screen changed to ${latest.asOf} meanwhile`);
    for (const r of targets) latest.news[r.symbol] = screen.news[r.symbol] as NewsBundle;
    latest.newsAt = new Date().toISOString();
    await writeJson(PATHS.screen, latest);
    await writeJson(PATHS.screenOn(latest.asOf), latest);
    return finish({ ...base, ok: true, detail: `new filings for ${targets.map((r) => r.symbol).join(", ")}; ${n} summaries updated`, log });
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
    return finish({ ...base, ok: false, detail, log });
  }
}
