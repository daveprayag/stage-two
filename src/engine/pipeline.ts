/**
 * Nightly jobs (called by Vercel Cron, see vercel.json):
 *  - runEod:  add any new NSE sessions to the price store, then recompute the screen.
 *  - runNews: fetch filings + headlines for the shortlist and add Gemini summaries.
 * Both are idempotent: running them twice for the same session does nothing the second time.
 */
import { PATHS, readJson, writeJson } from "./blob";
import { fetchHeadlines, verdicts } from "./news";
import {
  announcementsUrl, bhavcopyUrl, corpActionsUrl, indexCloseUrl, parseAnnouncements, parseBhavcopyZip,
  parseCorpActions, parseIndexClose, parseNseDate, parsePriceBands, politeGet, priceBandUrl, type CorpAction,
} from "./nse";
import { computeScreen } from "./screen";
import type { Filing, ISODate, NewsBundle, PriceStore, RunRecord, ScreenFile, ScreenRow } from "./types";
import { appendSession } from "./update";

const IST_OFFSET_MS = 5.5 * 3600_000;

export function istNow(now = Date.now()): { date: ISODate; hour: number } {
  const d = new Date(now + IST_OFFSET_MS);
  return { date: d.toISOString().slice(0, 10), hour: d.getUTCHours() };
}

export function addDays(d: ISODate, n: number): ISODate {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

async function appendRun(rec: RunRecord): Promise<void> {
  const runs = (await readJson<RunRecord[]>(PATHS.runs, true)) ?? [];
  runs.unshift(rec);
  await writeJson(PATHS.runs, runs.slice(0, 400));
}

async function text(url: string): Promise<string | null> {
  const b = await politeGet(url);
  return b ? new TextDecoder().decode(b) : null;
}

export async function runEod(opts: { force?: boolean; maxDays?: number } = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const log: string[] = [];
  let ok = true;
  let detail = "";
  try {
    const store = await readJson<PriceStore>(PATHS.prices, true);
    if (!store) throw new Error("no price store in Blob (run scripts/bootstrap.mts first)");
    const before = JSON.parse(JSON.stringify(store)) as PriceStore;
    const now = istNow();
    const days: ISODate[] = [];
    for (let d = addDays(store.asOf, 1); d <= now.date && days.length < (opts.maxDays ?? 10); d = addDays(d, 1)) days.push(d);
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
      const screen: ScreenFile = { ...computeScreen(store), news: {}, newsAt: null };
      await writeJson(PATHS.screen, screen);
      await writeJson(PATHS.screenOn(screen.asOf), screen);
      log.push(`screen ${screen.asOf}: ${screen.rows.length} rows`);
    }
    detail = added.length ? `added ${added.join(", ")}` : "no new session";
  } catch (e) {
    ok = false;
    detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
  }
  const rec: RunRecord = { job: "eod", startedAt, finishedAt: new Date().toISOString(), ok, detail, log };
  await appendRun(rec).catch(() => undefined);
  return rec;
}

interface AnnouncementStore {
  updated: string;
  bySymbol: Record<string, Filing[]>;
}

/** Shortlist for news: breakouts and setups first, then the rest by score; at most `max`. */
export function newsShortlist(rows: ScreenRow[], max = 60): ScreenRow[] {
  const rank = (r: ScreenRow) =>
    (r.tags.includes("breakout") ? 4 : 0) + (r.tags.includes("setup") ? 3 : 0) + (r.tags.includes("fresh2") ? 2 : 0) + (r.tags.includes("leader") ? 1 : 0);
  return [...rows].sort((a, b) => rank(b) - rank(a) || b.score - a.score).slice(0, max);
}

export async function runNews(opts: { force?: boolean; max?: number; backDays?: number } = {}): Promise<RunRecord> {
  const startedAt = new Date().toISOString();
  const log: string[] = [];
  let ok = true;
  let detail = "";
  try {
    const screen = await readJson<ScreenFile>(PATHS.screen, true);
    if (!screen) throw new Error("no screen yet");
    if (screen.newsAt && !opts.force) {
      detail = `news already added for ${screen.asOf}`;
    } else {
      // NSE filings: last 3 days into a rolling 21-day store.
      const ann = (await readJson<AnnouncementStore>(PATHS.announcements, true)) ?? { updated: "", bySymbol: {} };
      try {
        // First run: backfill three weeks; afterwards the last three days (filings land after hours and on weekends).
        const back = opts.backDays ?? (Object.keys(ann.bySymbol).length ? 3 : 21);
        const raw = await politeGet(announcementsUrl(addDays(screen.asOf, -back), istNow().date), "application/json");
        const fresh = raw ? parseAnnouncements(JSON.parse(new TextDecoder().decode(raw))) : [];
        for (const a of fresh) {
          const list = (ann.bySymbol[a.symbol] ??= []);
          if (!list.some((x) => x.date === a.date && x.category === a.category && x.text === a.text)) {
            list.push({ date: a.date, category: a.category, text: a.text, url: a.url });
          }
        }
        const cutoff = addDays(screen.asOf, -21);
        for (const [sym, list] of Object.entries(ann.bySymbol)) {
          const kept = list.filter((x) => (parseNseDate(x.date) ?? "") >= cutoff).sort((a, b) => ((parseNseDate(b.date) ?? "") < (parseNseDate(a.date) ?? "") ? -1 : 1));
          if (kept.length) ann.bySymbol[sym] = kept.slice(0, 15);
          else delete ann.bySymbol[sym];
        }
        ann.updated = new Date().toISOString();
        await writeJson(PATHS.announcements, ann);
        log.push(`NSE filings: ${fresh.length} records fetched, ${Object.keys(ann.bySymbol).length} symbols kept`);
      } catch (e) {
        log.push(`NSE filings unavailable: ${String(e)}`);
      }

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

      // Gemini in batches of 12 (parallel), then one retry pass in batches of 6 for any stock still missing.
      let n = 0;
      const ask = async (rows: ScreenRow[], size: number) => {
        const batches: ScreenRow[][] = [];
        for (let k = 0; k < rows.length; k += size) batches.push(rows.slice(k, k + size));
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
            if (b && !b.ai) {
              b.ai = v;
              n++;
            }
          }
        }
      };
      await ask(shortlist, 12);
      const missing = shortlist.filter((r) => !news[r.symbol]?.ai);
      if (missing.length) await ask(missing, 6);
      log.push(`AI summaries for ${n} stocks`);
      // Re-read in case the eod job replaced the screen meanwhile; only attach to the same session.
      const latest = (await readJson<ScreenFile>(PATHS.screen, true)) ?? screen;
      if (latest.asOf !== screen.asOf) throw new Error(`screen changed to ${latest.asOf} while fetching news for ${screen.asOf}`);
      latest.news = news;
      latest.newsAt = new Date().toISOString();
      await writeJson(PATHS.screen, latest);
      await writeJson(PATHS.screenOn(latest.asOf), latest);
      detail = `news for ${shortlist.length} stocks (${n} with AI summaries), session ${latest.asOf}`;
    }
  } catch (e) {
    ok = false;
    detail = String(e instanceof Error ? e.message : e);
    log.push(`ERROR ${detail}`);
  }
  const rec: RunRecord = { job: "news", startedAt, finishedAt: new Date().toISOString(), ok, detail, log };
  await appendRun(rec).catch(() => undefined);
  return rec;
}
