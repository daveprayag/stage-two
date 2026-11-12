/**
 * Stage Two engine on Cloudflare Workers (paid plan: up to 5 min CPU per run).
 * Cron (wrangler.jsonc, UTC):
 *   every 15 min 12:00–18:59  (17:30–00:29 IST)  new NSE session? → prices, screen, track; then news
 *   01:15                     (06:45 IST)        catch-up of the same, in case the evening runs missed it
 *   every minute 03:00–10:59 Mon–Fri (08:30–16:29 IST) live prices for every stock and index (2 NSE requests,
 *                             only 09:15–15:45 IST); new filings every 30 min
 * Public read-only API (CORS *), used by the Vercel site:
 *   /api/screen  /api/stock/:symbol  /api/live  /api/live/:symbol  /api/track  /api/runs
 *   /api/run/:job  (eod | news | filings | live) — manual trigger; the jobs throttle themselves
 *   /api/run/eod?rebuild=1 — rebuild the screen from stored prices (new sector labels), then refresh news
 *   /api/watchlist  GET (public) · POST {symbol} · DELETE /api/watchlist/:symbol · GET /api/watchlist/check
 *                   writes need the x-watch-key header to equal the WATCHLIST_KEY secret
 * Data lives in the R2 bucket bound as DATA (see src/engine/storage.ts P for the keys).
 */
import { stockDetail } from "../../src/engine/detail";
import { enrich, type EnrichCacheFile } from "../../src/engine/enrich";
import { fetchHeadlines, genericAi } from "../../src/engine/news";
import type { FinancialsFile } from "../../src/engine/financials";
import { fetchQuote, istNow, liveWindow, marketOpen, noTradingToday, runEod, runFilings, runLive, runNews, type Enricher, type LiveFile, type Picker } from "../../src/engine/jobs";
import { AI_PICKS_MODELS, makeAiPicks } from "../../src/engine/aipicks";
import { liveIsFresh } from "../../src/engine/clock";
import { isStar, marketNote, starChecks, starCount } from "../../src/engine/star";
import { P, type Storage } from "../../src/engine/storage";
import { readStocks, type StoreHeadFile } from "../../src/engine/storefile";
import { isTopSetup, topSetupChecks } from "../../src/engine/topsetup";
import { closesLookup, trackPerformance, type TrackEntry } from "../../src/engine/track";
import type { Filing, RunRecord, ScreenFile, ScreenRow } from "../../src/engine/types";
import { addItem, historyFor, removeItem, watchRow, watchSummary, type WatchFile, type WatchHistory, type WatchItem } from "../../src/engine/watchlist";

interface R2ObjectBody {
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
}
interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: string | ArrayBuffer | Uint8Array, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
}
interface Env {
  DATA: R2Bucket;
  APP_URL: string;
  /** Secret (wrangler secret put GEMINI_API_KEY). Without it, news enrichment falls back to the Vercel app. */
  GEMINI_API_KEY?: string;
  /** Optional comma-separated model fallbacks. */
  GEMINI_MODEL?: string;
  /** Optional model order for the daily AI picks. */
  AI_PICKS_MODEL?: string;
  /** Secret: the passcode for changing the watchlist. Without it the watchlist is read-only. */
  WATCHLIST_KEY?: string;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}
interface Controller {
  cron: string;
  scheduledTime: number;
}

class R2Storage implements Storage {
  constructor(private readonly b: R2Bucket) {}
  async get(path: string) {
    return (await this.b.get(path))?.body ?? null;
  }
  async getBytes(path: string) {
    const o = await this.b.get(path);
    return o ? new Uint8Array(await o.arrayBuffer()) : null;
  }
  async getJson<T>(path: string) {
    const o = await this.b.get(path);
    return o ? (JSON.parse(await o.text()) as T) : null;
  }
  async putJson(path: string, value: unknown) {
    await this.b.put(path, JSON.stringify(value), { httpMetadata: { contentType: "application/json" } });
  }
  async putBytes(path: string, bytes: Uint8Array, contentType: string) {
    await this.b.put(path, bytes, { httpMetadata: { contentType } });
  }
}

/** Headlines (Bing News) and Gemini summaries, computed here and cached in R2 per session. */
const enricher = (env: Env): Enricher => {
  if (!env.GEMINI_API_KEY) return vercelEnricher(env);
  const st = new R2Storage(env.DATA);
  return async (asOf, items) =>
    (await enrich(asOf, items, { apiKey: env.GEMINI_API_KEY!, models: env.GEMINI_MODEL }, {
      load: (d) => st.getJson<EnrichCacheFile>(P.enrichOn(d)),
      save: (d, v) => st.putJson(P.enrichOn(d), v),
    })).news;
};

/** AI picks experiment (src/engine/aipicks.ts), only with an AI key. AI_PICKS_MODEL overrides the model order. */
const picker = (env: Env): Picker | undefined =>
  env.GEMINI_API_KEY ? (screen) => makeAiPicks(screen, { apiKey: env.GEMINI_API_KEY! }, env.AI_PICKS_MODEL || AI_PICKS_MODELS) : undefined;

/** Fallback while the Worker has no Gemini key: the Vercel app does the same work. */
const vercelEnricher = (env: Env): Enricher => async (asOf, items) => {
  const res = await fetch(`${env.APP_URL}/api/enrich`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "stage-two-engine" },
    body: JSON.stringify({ asOf, items }),
  });
  if (!res.ok) throw new Error(`enrich → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { news: Awaited<ReturnType<Enricher>> }).news;
};

async function evening(env: Env, source: string): Promise<string[]> {
  const st = new R2Storage(env.DATA);
  const out: string[] = [];
  const eod = await runEod(st, { source });
  out.push(`eod: ${eod.skipped ? "skipped, " : ""}${eod.detail}`);
  const news = await runNews(st, enricher(env), { source, picker: picker(env) });
  out.push(`news: ${news.skipped ? "skipped, " : ""}${news.detail}`);
  return out;
}

async function daytime(env: Env, scheduledTime: number, source: string): Promise<string[]> {
  const st = new R2Storage(env.DATA);
  const out: string[] = [];
  const live = await runLive(st, { source });
  out.push(`live: ${live.detail}`);
  if (new Date(scheduledTime).getUTCMinutes() % 30 === 0) {
    const f = await runFilings(st, enricher(env), { source });
    out.push(`filings: ${f.skipped ? "skipped, " : ""}${f.detail}`);
  }
  return out;
}

/** Must match the weekday cron in wrangler.jsonc. */
const DAYTIME_CRON = "* 3-10 * * 1-5";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-watch-key",
};

function json(value: unknown, maxAge = 60, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store", ...CORS },
  });
}

/** A stored JSON file streamed straight from R2. */
function rawJson(body: ReadableStream<Uint8Array>, maxAge: number): Response {
  return new Response(body, {
    headers: { "content-type": "application/json", "cache-control": maxAge > 0 ? `public, max-age=${maxAge}` : "no-store", ...CORS },
  });
}

/** Cache an expensive GET in Cloudflare's edge cache, keyed by the URL plus a version (the session date). */
async function cached(req: Request, ctx: Ctx, version: string, make: () => Promise<Response>): Promise<Response> {
  const cache = (caches as unknown as { default: Cache }).default;
  const u = new URL(req.url);
  const key = new Request(`${u.origin}${u.pathname}?v=${encodeURIComponent(version)}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  const res = await make();
  // Failures (no-store) are not cached, so the next request tries again.
  if (res.ok && !/no-store/.test(res.headers.get("cache-control") ?? "")) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function stockApi(env: Env, symbol: string): Promise<Response> {
  const st = new R2Storage(env.DATA);
  const [head, screen, rows, ann, fin] = await Promise.all([
    st.getJson<StoreHeadFile>(P.head),
    st.getJson<ScreenFile>(P.screen),
    st.getJson<ScreenRow[]>(P.rows),
    st.getJson<{ bySymbol: Record<string, Filing[]> }>(P.announcements),
    st.getJson<FinancialsFile>(P.financials),
  ]);
  const body = await st.get(P.stocks);
  if (!head || !body) return json({ error: "no data" }, 60, 503);
  let found = null;
  for await (const s of readStocks(body)) {
    if (s.symbol === symbol) {
      found = s;
      break;
    }
  }
  if (!found) return json({ error: "not found" }, 300, 404);
  const row = rows?.find((r) => r.symbol === symbol) ?? null;
  const detail = stockDetail({ version: 1, asOf: head.asOf, dates: head.dates, indices: head.indices, stocks: { [found.isin]: found } }, symbol, row ?? undefined);
  if (!detail) return json({ error: "no detail" }, 300, 404);
  const news = screen?.news[symbol] ?? null;
  // Stocks outside the news shortlist: fetch headlines now (this response is edge-cached per session).
  const headlines = news?.headlines.length ? news.headlines : await fetchHeadlines(found.name, symbol).catch(() => []);
  return json(
    {
      asOf: head.asOf, detail, row, news, headlines, filings: ann?.bySymbol[symbol] ?? [], market: screen?.market ?? null,
      results: (() => {
        const r = fin?.bySymbol[symbol];
        if (!r) return null;
        const { checked: _checked, ...rest } = r;
        return rest;
      })(),
      aiPick: screen?.aiPicks?.asOf === head.asOf ? (screen.aiPicks.picks.find((p) => p.symbol === symbol) ?? null) : null,
      star: row ? { checks: starChecks(row, news ?? undefined), starred: isStar(row, news ?? undefined), market: marketNote(screen?.market) } : null,
      top: row ? { checks: topSetupChecks(row, news ?? undefined), pass: isTopSetup(row, news ?? undefined) } : null,
    },
    600,
  );
}

// ---------- Watchlist ----------

const EMPTY_WATCH: WatchFile = { version: 1, items: [] };

/** Constant-time comparison of the passcode header with the secret. */
function authed(req: Request, env: Env): boolean {
  const want = env.WATCHLIST_KEY ?? "";
  const got = req.headers.get("x-watch-key") ?? "";
  if (!want || got.length !== want.length) return false;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ got.charCodeAt(i);
  return d === 0;
}

async function denied(env: Env): Promise<Response> {
  if (!env.WATCHLIST_KEY) return json({ error: "The watchlist passcode is not set up yet (WATCHLIST_KEY secret)." }, 0, 503);
  await new Promise((r) => setTimeout(r, 400)); // slow down guessing
  return json({ error: "Wrong passcode." }, 0, 401);
}

/** Daily highs/lows since each item was added: one pass over the price store, edge-cached per session and list. */
async function watchHistories(st: R2Storage, ctx: Ctx, head: StoreHeadFile, items: WatchItem[]): Promise<Record<string, WatchHistory>> {
  const sig = items.map((i) => `${i.isin}@${i.session}`).sort().join(",");
  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://cache.internal/watch-history?v=${encodeURIComponent(`${head.asOf}|${sig}`)}`);
  const hit = await cache.match(key);
  if (hit) return (await hit.json()) as Record<string, WatchHistory>;
  const want = new Map(items.map((i) => [i.isin, i]));
  const out: Record<string, WatchHistory> = {};
  const body = await st.get(P.stocks);
  if (!body) throw new Error("no price store");
  for await (const s of readStocks(body)) {
    const it = want.get(s.isin);
    if (!it) continue;
    out[s.isin] = historyFor(it.session, head.dates, s);
    if (Object.keys(out).length === want.size) break;
  }
  ctx.waitUntil(cache.put(key, new Response(JSON.stringify(out), { headers: { "cache-control": "public, max-age=86400" } })));
  return out;
}

async function watchlistGet(env: Env, ctx: Ctx): Promise<Response> {
  const st = new R2Storage(env.DATA);
  const [file, head, screen, rows, live] = await Promise.all([
    st.getJson<WatchFile>(P.watchlist), st.getJson<StoreHeadFile>(P.head), st.getJson<ScreenFile>(P.screen),
    st.getJson<ScreenRow[]>(P.rows), st.getJson<LiveFile>(P.live),
  ]);
  if (!head || !screen) return json({ error: "no data" }, 0, 503);
  const items = (file ?? EMPTY_WATCH).items;
  const fresh = liveIsFresh(live, head.asOf);
  const hist = items.length ? await watchHistories(st, ctx, head, items) : {};
  const niftyClose = [...(head.indices["NIFTY 500"] ?? [])].reverse().find((x) => x !== null) ?? null;
  const niftyNow = fresh ? (live?.indices["NIFTY 500"]?.last ?? niftyClose) : niftyClose;
  const bySymbol = new Map((rows ?? []).map((r) => [r.symbol, r]));
  const out = items.map((it) => {
    const row = bySymbol.get(it.symbol);
    const news = screen.news[it.symbol];
    const q = fresh ? live?.q[it.symbol] : undefined;
    return watchRow(
      it,
      hist[it.isin] ?? { sessions: 0, high: null, low: null, close: null },
      { price: q ? q[0] : null, live: !!q },
      niftyNow,
      { starred: row ? isStar(row, news) : false, count: row?.tags.includes("momentum") ? starCount(row, news) : null },
    );
  });
  return json({ asOf: head.asOf, liveAt: fresh ? live?.at ?? null : null, liveFresh: fresh, marketLive: fresh && !!live?.marketOpen, items: out, summary: watchSummary(out), canEdit: !!env.WATCHLIST_KEY }, 0);
}

async function watchlistAdd(req: Request, env: Env): Promise<Response> {
  if (!authed(req, env)) return denied(env);
  const body = (await req.json().catch(() => null)) as { symbol?: string } | null;
  const symbol = (body?.symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9&_-]{1,20}$/.test(symbol)) return json({ error: "Give an NSE symbol, e.g. RELIANCE." }, 0, 400);
  const st = new R2Storage(env.DATA);
  const [file, head, screen, rows, live, closes] = await Promise.all([
    st.getJson<WatchFile>(P.watchlist), st.getJson<StoreHeadFile>(P.head), st.getJson<ScreenFile>(P.screen),
    st.getJson<ScreenRow[]>(P.rows), st.getJson<LiveFile>(P.live), st.getJson<Record<string, [string, number]>>(P.closes),
  ]);
  if (!head || !screen || !closes) return json({ error: "no data" }, 0, 503);
  const known = closes[symbol];
  if (!known) return json({ error: `${symbol} is not an NSE equity we have prices for.` }, 0, 404);
  const [isin, close] = known;
  const row = (rows ?? []).find((r) => r.symbol === symbol) ?? null;
  let name = row?.name ?? null;
  if (!name) {
    const stocks = await st.get(P.stocks);
    if (stocks) for await (const s of readStocks(stocks)) if (s.isin === isin) { name = s.name; break; }
  }
  const fresh = liveIsFresh(live, head.asOf);
  const q = fresh ? live?.q[symbol] : undefined;
  const niftyClose = [...(head.indices["NIFTY 500"] ?? [])].reverse().find((x) => x !== null) ?? null;
  const news = screen.news[symbol];
  const item: WatchItem = {
    symbol, isin, name: name ?? symbol,
    addedAt: new Date().toISOString(),
    session: head.asOf,
    price: q ? q[0] : close,
    nifty: fresh ? (live?.indices["NIFTY 500"]?.last ?? niftyClose) : niftyClose,
    starred: row ? isStar(row, news) : false,
    starCount: row?.tags.includes("momentum") ? starCount(row, news) : null,
    momentum: !!row?.tags.includes("momentum"),
    rs: row?.rs ?? null,
    stage: row?.stage ?? null,
    phase: row?.phase ?? null,
  };
  const next = addItem(file ?? EMPTY_WATCH, item);
  await st.putJson(P.watchlist, next);
  return json({ ok: true, item: next.items.find((x) => x.symbol === symbol) }, 0);
}

async function watchlistRemove(req: Request, env: Env, symbol: string): Promise<Response> {
  if (!authed(req, env)) return denied(env);
  const st = new R2Storage(env.DATA);
  const file = (await st.getJson<WatchFile>(P.watchlist)) ?? EMPTY_WATCH;
  await st.putJson(P.watchlist, removeItem(file, symbol.toUpperCase()));
  return json({ ok: true }, 0);
}

async function api(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const st = new R2Storage(env.DATA);
  const route = parts[1] ?? "";
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  switch (route) {
    case "watchlist": {
      const sub = parts[2] ? decodeURIComponent(parts[2]) : "";
      if (req.method === "GET" && sub === "check") return authed(req, env) ? json({ ok: true }, 0) : denied(env);
      if (req.method === "GET" && sub === "symbols") {
        const f = await st.getJson<WatchFile>(P.watchlist);
        return json({ symbols: (f ?? EMPTY_WATCH).items.map((i) => i.symbol), canEdit: !!env.WATCHLIST_KEY }, 0);
      }
      if (req.method === "GET" && !sub) return watchlistGet(env, ctx);
      if (req.method === "POST" && !sub) return watchlistAdd(req, env);
      if (req.method === "DELETE" && sub) return watchlistRemove(req, env, sub);
      return json({ error: "not found" }, 0, 404);
    }
    case "health":
      return json({ ok: true, marketOpen: marketOpen(), news: env.GEMINI_API_KEY ? "worker" : "vercel fallback" }, 0);
    case "screen": {
      // Stream the stored JSON as is: no parse and re-encode of ~0.5 MB on every request.
      const body = await st.get(P.screen);
      return body ? rawJson(body, 60) : json({ error: "no screen" }, 60);
    }
    case "stock": {
      const symbol = decodeURIComponent(parts[2] ?? "").toUpperCase();
      if (!symbol) return json({ error: "symbol?" }, 60, 400);
      const [head, screen] = await Promise.all([st.getJson<StoreHeadFile>(P.head), st.getJson<ScreenFile>(P.screen)]);
      // "v2": bump when the response shape changes, so old edge-cached copies are not served.
      return cached(req, ctx, `v4|${head?.asOf ?? ""}|${screen?.newsAt ?? ""}|${screen?.aiPicks?.at ?? ""}`, () => stockApi(env, symbol));
    }
    case "live": {
      if (!parts[2]) {
        const body = await st.get(P.live);
        return body ? rawJson(body, 20) : json({ at: "", marketOpen: marketOpen(), time: "", date: null, indices: {}, q: {} }, 20);
      }
      const symbol = decodeURIComponent(parts[2]).toUpperCase();
      const open = marketOpen();
      if (!liveWindow() || (await noTradingToday(st))) {
        // Market closed: one NSE request per stock per session, then the same quote from the edge cache until the next
        // session's live prices start (the key changes when the live file moves to a new date).
        const live = await st.getJson<LiveFile>(P.live);
        return cached(req, ctx, `closed|${live?.date ?? istNow().date}`, async () => {
          const q = await fetchQuote(symbol).catch(() => null);
          return json({ marketOpen: false, quote: q }, q ? 86_400 : 0);
        });
      }
      const bucket = Math.floor(Date.now() / 30_000);
      return cached(req, ctx, String(bucket), async () => {
        const q = await fetchQuote(symbol).catch(() => null);
        // Trading now only if NSE's quote is from today (holidays look open by the clock).
        return json({ marketOpen: open && q?.date === istNow().date, quote: q }, q ? 30 : 0);
      });
    }
    case "track": {
      const [entries, head, closes] = await Promise.all([st.getJson<TrackEntry[]>(P.track), st.getJson<StoreHeadFile>(P.head), st.getJson<Record<string, [string, number]>>(P.closes)]);
      if (!entries || !head || !closes) return json({ first: null, lists: [], days: [] }, 300);
      return json({ first: entries[0]?.date ?? null, ...trackPerformance(entries, closesLookup(head.dates, closes, head.indices)) }, 300);
    }
    case "runs": {
      const [runs, eod, filings, live] = await Promise.all([
        st.getJson<RunRecord[]>(P.runs), st.getJson(P.eodState), st.getJson(P.filingsState), st.getJson(P.liveState),
      ]);
      // Older records named the AI model; the site only ever says "AI".
      const shown = (runs ?? []).map((r) => ({ ...r, detail: genericAi(r.detail), log: r.log.map(genericAi) }));
      return json({ runs: shown, eod, filings, live }, 30);
    }
    case "run": {
      const job = parts[2];
      const source = "manual";
      if (job === "eod" && url.searchParams.get("rebuild") === "1") {
        const eod = await runEod(st, { source, rebuild: true });
        const news = eod.ok && !eod.skipped ? await runNews(st, enricher(env), { source, picker: picker(env) }) : null;
        return json({ eod, news }, 0);
      }
      const rec =
        job === "eod" ? await runEod(st, { source }) : job === "news" ? await runNews(st, enricher(env), { source, picker: picker(env), repick: url.searchParams.get("repick") === "1" })
          : job === "filings" ? await runFilings(st, enricher(env), { source }) : job === "live" ? await runLive(st, { source, anyTime: true }) : null;
      return rec ? json(rec, 0) : json({ error: "job must be eod, news, filings or live" }, 0, 400);
    }
    default:
      return json({ error: "not found" }, 60, 404);
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: Ctx): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try {
        return await api(req, env, ctx);
      } catch (e) {
        return json({ error: String(e) }, 0, 500);
      }
    }
    return new Response("Stage Two engine. Data API under /api/.", { headers: CORS });
  },

  async scheduled(controller: Controller, env: Env, ctx: Ctx): Promise<void> {
    const source = "cloudflare";
    const daytimeCron = controller.cron === DAYTIME_CRON;
    ctx.waitUntil(
      (daytimeCron ? daytime(env, controller.scheduledTime, source) : evening(env, source)).then((lines) => {
        for (const l of lines) console.log(l);
      }),
    );
  },
};
