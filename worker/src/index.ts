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
 * Data lives in the R2 bucket bound as DATA (see src/engine/storage.ts P for the keys).
 */
import { stockDetail } from "../../src/engine/detail";
import { enrich, type EnrichCacheFile } from "../../src/engine/enrich";
import { fetchHeadlines } from "../../src/engine/news";
import { fetchQuote, marketOpen, runEod, runFilings, runLive, runNews, type Enricher, type LiveFile } from "../../src/engine/jobs";
import { isStar, marketNote, starChecks } from "../../src/engine/star";
import { P, type Storage } from "../../src/engine/storage";
import { readStocks, type StoreHeadFile } from "../../src/engine/storefile";
import { isTopSetup, topSetupChecks } from "../../src/engine/topsetup";
import { closesLookup, trackPerformance, type TrackEntry } from "../../src/engine/track";
import type { Filing, RunRecord, ScreenFile, ScreenRow } from "../../src/engine/types";

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
  const news = await runNews(st, enricher(env), { source });
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

const CORS = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" };

function json(value: unknown, maxAge = 60, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": `public, max-age=${maxAge}`, ...CORS },
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
  if (res.ok) ctx.waitUntil(cache.put(key, res.clone()));
  return res;
}

async function stockApi(env: Env, symbol: string): Promise<Response> {
  const st = new R2Storage(env.DATA);
  const [head, screen, rows, ann] = await Promise.all([
    st.getJson<StoreHeadFile>(P.head),
    st.getJson<ScreenFile>(P.screen),
    st.getJson<ScreenRow[]>(P.rows),
    st.getJson<{ bySymbol: Record<string, Filing[]> }>(P.announcements),
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
      star: row ? { checks: starChecks(row, news ?? undefined), starred: isStar(row, news ?? undefined), market: marketNote(screen?.market) } : null,
      top: row ? { checks: topSetupChecks(row, news ?? undefined), pass: isTopSetup(row, news ?? undefined) } : null,
    },
    600,
  );
}

async function api(req: Request, env: Env, ctx: Ctx): Promise<Response> {
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  const st = new R2Storage(env.DATA);
  const route = parts[1] ?? "";
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  switch (route) {
    case "health":
      return json({ ok: true, marketOpen: marketOpen(), news: env.GEMINI_API_KEY ? "worker" : "vercel fallback" }, 0);
    case "screen":
      return json((await st.getJson<ScreenFile>(P.screen)) ?? { error: "no screen" }, 60);
    case "stock": {
      const symbol = decodeURIComponent(parts[2] ?? "").toUpperCase();
      if (!symbol) return json({ error: "symbol?" }, 60, 400);
      const [head, screen] = await Promise.all([st.getJson<StoreHeadFile>(P.head), st.getJson<ScreenFile>(P.screen)]);
      // "v2": bump when the response shape changes, so old edge-cached copies are not served.
      return cached(req, ctx, `v2|${head?.asOf ?? ""}|${screen?.newsAt ?? ""}`, () => stockApi(env, symbol));
    }
    case "live": {
      if (!parts[2]) return json((await st.getJson<LiveFile>(P.live)) ?? { at: "", marketOpen: marketOpen(), time: "", date: null, indices: {}, q: {} }, 20);
      const symbol = decodeURIComponent(parts[2]).toUpperCase();
      const open = marketOpen();
      const bucket = Math.floor(Date.now() / (open ? 30_000 : 600_000));
      return cached(req, ctx, String(bucket), async () => {
        const q = await fetchQuote(symbol).catch(() => null);
        return json({ marketOpen: open, quote: q }, open ? 30 : 600);
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
      return json({ runs: runs ?? [], eod, filings, live }, 30);
    }
    case "run": {
      const job = parts[2];
      const source = "manual";
      if (job === "eod" && url.searchParams.get("rebuild") === "1") {
        const eod = await runEod(st, { source, rebuild: true });
        const news = eod.ok && !eod.skipped ? await runNews(st, enricher(env), { source }) : null;
        return json({ eod, news }, 0);
      }
      const rec =
        job === "eod" ? await runEod(st, { source }) : job === "news" ? await runNews(st, enricher(env), { source })
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
