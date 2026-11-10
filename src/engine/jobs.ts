/**
 * Scheduled jobs, storage-agnostic (the Cloudflare Worker runs them on R2):
 *  - runEod:     cheap check (one HEAD per pending day); when a new NSE session exists, stream the price store one stock
 *                at a time — apply the sessions, analyse, write back — then rank, save the screen, rows, closes and
 *                the track entry, and label up to 30 new listings with NSE's sector.
 *  - runNews:    NSE filings (fetched here) + headlines and Gemini summaries from the Vercel enrich endpoint (Google
 *                News blocks Cloudflare; the Gemini key lives on Vercel).
 *  - runFilings: in market hours, new filings for shortlisted stocks → re-summarise only those.
 *  - runLive:    in market hours, live quotes for the watch set (starred, top setups, momentum leaders, resuming,
 *                breakouts), at most ~60 stocks, ≤ 1 request/second.
 * All are idempotent and throttled; runs that did nothing are not written to the history.
 */
import {
  announcementsUrl, bhavcopyUrl, corpActionsUrl, ddmmyyyy, indexCloseUrl, parseAnnouncements, parseBhavcopyZip, parseCorpActions,
  parseIndexClose, parseNseDate, parsePriceBands, parseQuote, parseSector, politeGet, politeHead, priceBandUrl, sectorUrl,
  ALL_INDICES_URL, parseAllIndices, parseStocksTraded, STOCKS_TRADED_URL, type CorpAction, type LiveIndex, type LiveQuote,
} from "./nse";
import { analyseStock, BENCHMARK, rankWork, screenFromWork, withSector, type Sectors, type Work } from "./screen";
import { P, type Storage } from "./storage";
import { readStocks, StocksWriter, type StoreHeadFile } from "./storefile";
import { picksFor, upsertEntry, type TrackEntry } from "./track";
import type { Filing, Headline, ISODate, NewsBundle, NewsVerdict, RunRecord, ScreenFile, ScreenRow } from "./types";
import { SessionsUpdater, WINDOW, type SessionInput } from "./update";
import { istNow, liveWindow, marketOpen } from "./clock";
import { BOARD_MEETINGS_URL, mergeResults, parseBoardMeetings, RESULTS_AHEAD_DAYS, RESULTS_BACK_DAYS, type ResultsFile } from "./results";

export { istNow, liveWindow, marketOpen };


const MIN_EOD_GAP_MS = 5 * 60_000;
const MIN_FILINGS_GAP_MS = 20 * 60_000;
const MIN_LIVE_GAP_MS = 45_000;
const LABELS_PER_RUN = 30;

export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

export interface JobOptions {
  force?: boolean;
  /** EOD only: rebuild the screen from the stored prices even without a new session (e.g. after new sector labels).
   *  Unlike force, still throttled to one run per 5 minutes, so it can be exposed on the public API. */
  rebuild?: boolean;
  /** Live only: run outside market hours (manual trigger); the one-minute throttle still applies. */
  anyTime?: boolean;
  source?: string;
}

/** The Vercel endpoint that fetches headlines and Gemini summaries (POST { asOf, items }). */
export interface Enricher {
  (asOf: ISODate, items: EnrichItem[]): Promise<Record<string, { headlines: Headline[]; ai: NewsVerdict | null }>>;
}

export interface EnrichItem {
  symbol: string;
  name: string;
  industry: string | null;
  filings: Filing[];
  /** What the summary prompt needs about the price action. */
  chgPct: number;
  ret1m: number | null;
  pctFromHigh: number;
  stage: number;
  breakout: boolean;
}

const ago = (iso: string | null | undefined) => (iso ? Date.now() - Date.parse(iso) : Number.POSITIVE_INFINITY);

async function appendRun(st: Storage, rec: RunRecord): Promise<void> {
  if (rec.skipped) return;
  const runs = (await st.getJson<RunRecord[]>(P.runs)) ?? [];
  runs.unshift(rec);
  await st.putJson(P.runs, runs.slice(0, 400));
}

async function finish(st: Storage, rec: Omit<RunRecord, "finishedAt">): Promise<RunRecord> {
  const done: RunRecord = { ...rec, finishedAt: new Date().toISOString() };
  await appendRun(st, done).catch(() => undefined);
  return done;
}

async function text(url: string): Promise<string | null> {
  const b = await politeGet(url);
  return b ? new TextDecoder().decode(b) : null;
}

function pendingDays(asOf: ISODate, max = 10): ISODate[] {
  const today = istNow().date;
  const days: ISODate[] = [];
  for (let d = addDays(asOf, 1); d <= today && days.length < max; d = addDays(d, 1)) days.push(d);
  return days;
}

async function recordPicks(st: Storage, screen: ScreenFile, log: string[]): Promise<void> {
  const entries = (await st.getJson<TrackEntry[]>(P.track)) ?? [];
  const e = picksFor(screen);
  await st.putJson(P.track, upsertEntry(entries, e));
  log.push(`track record: ${Object.entries(e.lists).map(([k, v]) => `${k} ${v?.length ?? 0}`).join(", ")}`);
}

/**
 * Results meeting dates from NSE's board-meetings list (one request: the last 30 days to 35 days ahead), merged into
 * the stored file. On failure the stored dates are used; results are context, never a reason to stop the run.
 */
async function refreshResults(st: Storage, log: string[]): Promise<ResultsFile> {
  const prev = await st.getJson<ResultsFile>(P.results);
  const today = istNow().date;
  const from = addDays(today, -RESULTS_BACK_DAYS);
  try {
    const raw = await politeGet(`${BOARD_MEETINGS_URL}&from_date=${ddmmyyyy(from, "-")}&to_date=${ddmmyyyy(addDays(today, RESULTS_AHEAD_DAYS), "-")}`, "application/json");
    const fresh = raw ? parseBoardMeetings(JSON.parse(new TextDecoder().decode(raw))) : {};
    const file: ResultsFile = { at: new Date().toISOString(), bySymbol: mergeResults(prev?.bySymbol, fresh, from) };
    await st.putJson(P.results, file);
    log.push(`results dates: ${Object.keys(fresh).length} stocks with results meetings ${from} → ${addDays(today, RESULTS_AHEAD_DAYS)}`);
    return file;
  } catch (e) {
    log.push(`results dates unavailable (${String(e)}); using the stored ones`);
    return prev ?? { at: "", bySymbol: {} };
  }
}

/** Download what is needed to add the given days; days without a bhavcopy are skipped (holidays). */
async function fetchSessions(days: ISODate[], log: string[]): Promise<SessionInput[]> {
  let corp: CorpAction[] | undefined;
  try {
    const raw = await politeGet(corpActionsUrl(days[0] as ISODate, days[days.length - 1] as ISODate), "application/json");
    corp = raw ? parseCorpActions(JSON.parse(new TextDecoder().decode(raw))) : [];
    log.push(`corporate actions: ${corp.length} records`);
  } catch (e) {
    log.push(`corporate actions unavailable (${String(e)}); using the price-gap check`);
  }
  const out: SessionInput[] = [];
  const today = istNow().date;
  for (const d of days) {
    const zip = await politeGet(bhavcopyUrl(d), "application/zip,*/*");
    if (!zip) {
      log.push(d === today ? `${d}: bhavcopy not published yet` : `${d}: no session (holiday or weekend)`);
      continue;
    }
    const { rows } = parseBhavcopyZip(new Uint8Array(zip));
    if (rows.length < 500) {
      log.push(`${d}: only ${rows.length} rows, skipped`);
      continue;
    }
    const idxText = await text(indexCloseUrl(d));
    const bandText = await text(priceBandUrl(d)).catch(() => null);
    out.push({
      date: d, rows, indexCloses: idxText ? parseIndexClose(idxText) : new Map(),
      ...(bandText ? { bands: parsePriceBands(bandText) } : {}), ...(corp ? { corpActions: corp } : {}),
    });
  }
  return out;
}

async function labelStocks(st: Storage, symbols: string[], sectors: Sectors, log: string[]): Promise<void> {
  const todo = symbols.slice(0, LABELS_PER_RUN);
  if (!todo.length) return;
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
  await st.putJson(P.sectors, sectors);
  log.push(`sectors: ${added} of ${todo.length} unlabelled stocks labelled (${symbols.length - todo.length} left)`);
}

export async function runEod(st: Storage, opts: JobOptions = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const base = { job: "eod" as const, startedAt, ...(opts.source ? { source: opts.source } : {}) };
  const log: string[] = [];
  try {
    const state = (await st.getJson<{ asOf: ISODate | null; lastCheck: string | null }>(P.eodState)) ?? { asOf: null, lastCheck: null };
    if (!opts.force && ago(state.lastCheck) < MIN_EOD_GAP_MS) return finish(st, { ...base, ok: true, skipped: true, detail: "checked less than 5 minutes ago", log });
    await st.putJson(P.eodState, { ...state, lastCheck: startedAt });
    const head = await st.getJson<StoreHeadFile>(P.head);
    if (!head) throw new Error("no price store in R2 (run the migration first)");
    const days = pendingDays(head.asOf);
    if (!opts.force && !opts.rebuild) {
      let found = false;
      for (const d of days) {
        if (await politeHead(bhavcopyUrl(d)).catch(() => false)) {
          found = true;
          break;
        }
      }
      if (!found) return finish(st, { ...base, ok: true, skipped: true, detail: days.length ? `no new NSE file yet (${days.join(", ")})` : "up to date", log });
    }
    log.push(`store as of ${head.asOf}; checking ${days.join(", ") || "nothing"}`);
    const sessions = days.length ? await fetchSessions(days, log) : [];
    if (!sessions.length && !opts.force && !opts.rebuild) return finish(st, { ...base, ok: true, skipped: true, detail: "no new session", log });

    const sectors = (await st.getJson<Sectors>(P.sectors)) ?? {};
    const results = (await refreshResults(st, log)).bySymbol;
    const old = await st.getBytes(P.stocks);
    if (!old) throw new Error("no prices/stocks.ndjson.gz in R2");
    const u = new SessionsUpdater(head, sessions, WINDOW, head.isins);
    const writer = new StocksWriter();
    const work: Work[] = [];
    const isins: string[] = [];
    const closes: Record<string, [string, number]> = {};
    const unlabelled: string[] = [];
    const bench = head.indices[BENCHMARK] ?? [];
    const keep = async (s: import("./types").StockSeries) => {
      await writer.write(s);
      isins.push(s.isin);
      for (let k = s.c.length - 1; k >= 0; k--) {
        const c = s.c[k];
        if (c !== null && c !== undefined) {
          closes[s.symbol] = [s.isin, c];
          break;
        }
      }
      if (s.series === "EQ" && sectors[s.symbol] === undefined) unlabelled.push(s.symbol);
      const w = analyseStock(head, withSector(s, sectors), bench, results[s.symbol]);
      if (w) work.push(w);
    };
    for await (const s of readStocks(new Blob([old as Uint8Array<ArrayBuffer>]).stream())) {
      const kept = sessions.length ? u.update(s) : s;
      if (kept) await keep(kept);
    }
    if (sessions.length) {
      for (const s of u.finish()) {
        await keep(s);
        // New listings are labelled first.
        const idx = unlabelled.indexOf(s.symbol);
        if (idx > 0) unlabelled.unshift(...unlabelled.splice(idx, 1));
      }
    }
    log.push(...u.log.slice(0, 40));
    head.isins = isins;
    const stocks = await writer.finish();
    if (sessions.length) {
      await st.putBytes(P.stocksPrev, old, "application/gzip");
      await st.putBytes(P.stocks, stocks, "application/gzip");
      await st.putJson(P.head, head);
    }
    await st.putJson(P.closes, closes);
    const ranked = rankWork(work);
    // Same session rebuilt: keep the news already fetched; newsAt null makes the news job refresh the shortlist.
    // Carry the last news over until the news job replaces it (newsAt null makes it run), so a new session does not
    // briefly show no stars between the two jobs.
    const prev = await st.getJson<ScreenFile>(P.screen);
    const screen: ScreenFile = { ...screenFromWork(head, ranked), news: prev?.news ?? {}, newsAt: null };
    await st.putJson(P.screen, screen);
    await st.putJson(P.screenOn(screen.asOf), screen);
    await st.putJson(P.rows, ranked.all);
    log.push(`screen ${screen.asOf}: ${screen.rows.length} rows, ${writer.count} stocks stored`);
    await recordPicks(st, screen, log);
    await labelStocks(st, unlabelled, sectors, log).catch((e) => log.push(`sector labels failed: ${String(e)}`));
    await st.putJson(P.eodState, { asOf: head.asOf, lastCheck: startedAt });
    return finish(st, { ...base, ok: true, detail: sessions.length ? `added ${sessions.map((x) => x.date).join(", ")}` : `screen rebuilt for ${head.asOf}`, log });
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
    return finish(st, { ...base, ok: false, detail, log });
  }
}

interface AnnouncementStore {
  updated: string;
  bySymbol: Record<string, Filing[]>;
}

const filingKey = (x: Filing) => `${x.date}|${x.category}|${x.text}`;

async function refreshFilings(st: Storage, from: ISODate, asOf: ISODate, log: string[]): Promise<{ ann: AnnouncementStore; changed: Set<string> }> {
  const ann = (await st.getJson<AnnouncementStore>(P.announcements)) ?? { updated: "", bySymbol: {} };
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
    const cutoff = addDays(asOf, -21);
    const key = (x: Filing) => parseNseDate(x.date) ?? "";
    for (const [sym, list] of Object.entries(ann.bySymbol)) {
      const kept = list.filter((x) => key(x) >= cutoff).sort((a, b) => key(b).localeCompare(key(a)) || b.date.localeCompare(a.date));
      if (kept.length) ann.bySymbol[sym] = kept.slice(0, 15);
      else delete ann.bySymbol[sym];
    }
    ann.updated = new Date().toISOString();
    await st.putJson(P.announcements, ann);
    log.push(`NSE filings: ${fresh.length} fetched, ${changed.size} symbols with new ones`);
  } catch (e) {
    log.push(`NSE filings unavailable: ${String(e)}`);
  }
  return { ann, changed };
}

/** Shortlist for news: top-setup candidates, momentum leaders, breakouts and setups, then by score; at most `max`. */
export function newsShortlist(rows: ScreenRow[], max = 60): ScreenRow[] {
  const rank = (r: ScreenRow) =>
    (r.tags.includes("qualified") ? 8 : 0) + (r.tags.includes("momentum") ? 6 : 0) +
    (r.tags.includes("breakout") ? 4 : 0) + (r.tags.includes("setup") ? 3 : 0) + (r.tags.includes("fresh2") ? 2 : 0) + (r.tags.includes("leader") ? 1 : 0);
  return [...rows].sort((a, b) => rank(b) - rank(a) || b.score - a.score).slice(0, max);
}

const itemFor = (r: ScreenRow, filings: Filing[]): EnrichItem => ({
  symbol: r.symbol, name: r.name, industry: r.industry, filings: filings.slice(0, 6),
  chgPct: r.chgPct, ret1m: r.ret1m, pctFromHigh: r.pctFromHigh, stage: r.stage, breakout: r.breakout,
});

export async function runNews(st: Storage, enrich: Enricher, opts: JobOptions & { max?: number } = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const base = { job: "news" as const, startedAt, ...(opts.source ? { source: opts.source } : {}) };
  const log: string[] = [];
  try {
    const screen = await st.getJson<ScreenFile>(P.screen);
    if (!screen) throw new Error("no screen yet");
    if (screen.newsAt && !opts.force) return finish(st, { ...base, ok: true, skipped: true, detail: `news already added for ${screen.asOf}`, log });
    const existing = await st.getJson<AnnouncementStore>(P.announcements);
    const back = existing && Object.keys(existing.bySymbol).length ? 3 : 21;
    const { ann } = await refreshFilings(st, addDays(screen.asOf, -back), screen.asOf, log);
    const shortlist = newsShortlist(screen.rows, opts.max ?? 60);
    const got = await enrich(screen.asOf, shortlist.map((r) => itemFor(r, ann.bySymbol[r.symbol] ?? [])));
    const news: Record<string, NewsBundle> = {};
    let n = 0;
    for (const r of shortlist) {
      const g = got[r.symbol];
      news[r.symbol] = { filings: (ann.bySymbol[r.symbol] ?? []).slice(0, 6), headlines: g?.headlines ?? [], ai: g?.ai ?? null };
      if (g?.ai) n++;
    }
    log.push(`headlines and summaries for ${shortlist.length} stocks (${n} with AI summaries)`);
    const latest = (await st.getJson<ScreenFile>(P.screen)) ?? screen;
    if (latest.asOf !== screen.asOf) throw new Error(`screen changed to ${latest.asOf} while fetching news for ${screen.asOf}`);
    latest.news = news;
    latest.newsAt = new Date().toISOString();
    await st.putJson(P.screen, latest);
    await st.putJson(P.screenOn(latest.asOf), latest);
    await st.putJson(P.filingsState, { lastCheck: latest.newsAt });
    await recordPicks(st, latest, log);
    return finish(st, { ...base, ok: true, detail: `news for ${shortlist.length} stocks (${n} with AI summaries), session ${latest.asOf}`, log });
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
    return finish(st, { ...base, ok: false, detail, log });
  }
}

export async function runFilings(st: Storage, enrich: Enricher, opts: JobOptions = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const base = { job: "filings" as const, startedAt, ...(opts.source ? { source: opts.source } : {}) };
  const log: string[] = [];
  try {
    const state = (await st.getJson<{ lastCheck: string | null }>(P.filingsState)) ?? { lastCheck: null };
    if (!opts.force && ago(state.lastCheck) < MIN_FILINGS_GAP_MS) return finish(st, { ...base, ok: true, skipped: true, detail: "checked less than 20 minutes ago", log });
    await st.putJson(P.filingsState, { lastCheck: startedAt });
    const screen = await st.getJson<ScreenFile>(P.screen);
    if (!screen?.newsAt) return finish(st, { ...base, ok: true, skipped: true, detail: "waiting for the news job", log });
    const { ann, changed } = await refreshFilings(st, addDays(istNow().date, -1), screen.asOf, log);
    const targets = screen.rows.filter((r) => screen.news[r.symbol] && changed.has(r.symbol));
    if (!targets.length) return finish(st, { ...base, ok: true, skipped: true, detail: "no new filings for shortlisted stocks", log });
    const got = await enrich(screen.asOf, targets.map((r) => itemFor(r, ann.bySymbol[r.symbol] ?? [])));
    const latest = (await st.getJson<ScreenFile>(P.screen)) ?? screen;
    if (latest.asOf !== screen.asOf) throw new Error(`screen changed to ${latest.asOf} meanwhile`);
    let n = 0;
    for (const r of targets) {
      const b = latest.news[r.symbol];
      if (!b) continue;
      b.filings = (ann.bySymbol[r.symbol] ?? []).slice(0, 6);
      const g = got[r.symbol];
      if (g) {
        b.headlines = g.headlines.length ? g.headlines : b.headlines;
        if (g.ai) {
          // Stars are set once a day by the evening news job. A new filing updates the summary and can add a red flag
          // (which removes the star), but the sentiment stays as judged that evening, so stars do not flip on re-wording.
          b.ai = b.ai ? { ...g.ai, sentiment: b.ai.sentiment } : g.ai;
          n++;
        }
      }
    }
    latest.newsAt = new Date().toISOString();
    await st.putJson(P.screen, latest);
    await st.putJson(P.screenOn(latest.asOf), latest);
    await recordPicks(st, latest, log);
    return finish(st, { ...base, ok: true, detail: `new filings for ${targets.map((r) => r.symbol).join(", ")}; ${n} summaries updated`, log });
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
    return finish(st, { ...base, ok: false, detail, log });
  }
}

/** live/latest.json: every stored stock's latest price and every index, refreshed every minute in market hours. */
export interface LiveFile {
  /** When the engine fetched it (ISO). */
  at: string;
  marketOpen: boolean;
  /** NSE's own timestamp, "09-Nov-2026 15:30", and its date (the session these prices belong to). */
  time: string;
  date: ISODate | null;
  indices: Record<string, LiveIndex>;
  /** symbol → [last price, % change, volume]. */
  q: Record<string, [number, number, number]>;
}

export async function fetchQuote(symbol: string): Promise<LiveQuote | null> {
  const raw = await politeGet(sectorUrl(symbol), "application/json", 1);
  return raw ? parseQuote(symbol, JSON.parse(new TextDecoder().decode(raw))) : null;
}

export async function runLive(st: Storage, opts: JobOptions = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const base = { job: "live" as const, startedAt, ...(opts.source ? { source: opts.source } : {}) };
  const log: string[] = [];
  try {
    const state = (await st.getJson<{ lastRun: string | null }>(P.liveState)) ?? { lastRun: null };
    if (!opts.force && ago(state.lastRun) < MIN_LIVE_GAP_MS) return finish(st, { ...base, ok: true, skipped: true, detail: "ran less than a minute ago", log });
    if (!opts.force && !opts.anyTime && !liveWindow()) return finish(st, { ...base, ok: true, skipped: true, detail: "market closed", log });
    await st.putJson(P.liveState, { lastRun: startedAt });
    // Two requests cover every stock and index.
    const [tradedRaw, indicesRaw, closes] = await Promise.all([
      politeGet(STOCKS_TRADED_URL, "application/json"),
      politeGet(ALL_INDICES_URL, "application/json"),
      st.getJson<Record<string, [string, number]>>(P.closes),
    ]);
    const dec = new TextDecoder();
    const traded = tradedRaw ? parseStocksTraded(JSON.parse(dec.decode(tradedRaw))) : { time: "", rows: [] };
    const idx = indicesRaw ? parseAllIndices(JSON.parse(dec.decode(indicesRaw))) : { time: "", indices: {} };
    // Only stocks we store (EQ/BE), so the file stays small (~100 KB).
    const known = closes ?? {};
    const q: LiveFile["q"] = {};
    for (const r of traded.rows) if (known[r.symbol] && (r.series === "EQ" || r.series === "BE")) q[r.symbol] = [r.last, r.pChange, r.volume];
    const time = traded.time || idx.time;
    const date = parseNseDate(time);
    // "Open" only if NSE's data is from today: on a trading holiday the clock says open but prices are the last close.
    await st.putJson(P.live, { at: startedAt, marketOpen: marketOpen() && date === istNow().date, time, date, indices: idx.indices, q } satisfies LiveFile);
    // skipped: true keeps these every-minute runs out of the run history; the Runs page shows meta/live.json.
    return finish(st, { ...base, ok: true, skipped: true, detail: `${Object.keys(q).length} stocks, ${Object.keys(idx.indices).length} indices at ${time}`, log });
  } catch (e) {
    const detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
    return finish(st, { ...base, ok: false, detail, log });
  }
}
