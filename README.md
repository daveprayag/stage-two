# Stage Two

End-of-day momentum screener for NSE stocks. Every evening it adds the day's NSE data, finds stocks entering or leading
an uptrend, and attaches the news behind each move (NSE filings, headlines, a Gemini summary).

Formerly *StockGenius* (Yahoo Finance, ~380 hardcoded symbols). Now every EQ stock on NSE from NSE's own files.

## Screens

| Screen | Rule |
| --- | --- |
| Strongest | RS ≥ 90 and trend template ≥ 7/8 (livermore: hit +50% in 6 months 29% vs 20% for all stocks in the pre-registered 2016–21 test, beat the average stock in 45/64 months; 35% vs 23% in 2021–24; 17% vs 13% in 2025–26) |
| Momentum leaders | RS ≥ 80, 20-day ADR in the top 40% of liquid stocks, industry in the top 40% by median 3-month return, stage 2 (livermore: passed the pre-registered 2016–21 test, 49/64 months, +7.2 pp on simple averages and +6.8 pp on EMAs; failed 2025–26, +1.3 pp, simple averages) |
| Resuming after a pause | Rallied 20%+, paused 5+ sessions within 25%, closed back above the pause top in the last 5 sessions, ≤ 8% above it; stop = pause low |

Removed from the UI on 2026-11-10 (still tagged in the engine; all but Ankur's scans still recorded in the track record): Top setups, Breaking out,
Tight near highs, New uptrends, Ankur's scans. Tight ranges and breakouts found big gainers no more often than a random stock.

Star (★): a momentum leader that passes at least 5 of 6 checks (momentum profile, early/mid phase, RS ≥ 90, 3+ strong
stocks in its industry, positive news without red flags, resuming after a pause with a stop ≤ 12%). Market (NIFTY 500 vs
its 200-day EMA) is shown but not counted. A summary of the Guide's selection steps, not a separately tested signal.

Phase (stage 2 only): rallies (20%+ without a 10% pullback) counted from when the stock left its latest side-trend base
(40+ sessions within a 35% range, ending within 12% of where it started, 50-day EMA moving at most 5%). Early = in
or just out of the base, or the first rally; mid = second; late = third or later, any 80%+ rally, or no base in the
~14 months of history. The screener can show early only or early + mid.

Universe: EQ series, not ETFs/index funds, close > ₹30, 50-day average traded value ≥ ₹2 Cr, not in the 2% / 5% price bands.
Stage = Weinstein stage from the 150-day EMA; RS = percentile of 3/6/9/12-month returns (latest quarter double).
Support/resistance = clusters of swing highs/lows (5 bars each side, 2.5% tolerance); trendlines = longest line through
two rising lows / falling highs that no close has broken. These are shortlists, not tested buy signals (see /guide).

Moving averages: every price line and trend rule uses EMAs (50/150/200-day; since 2026-11-11, livermore DECISIONS.md
"Moving averages: EMA"); volume and traded-value averages are simple averages. The store keeps 300 sessions, so each stock
and index carries `ema0`, its EMAs on the session before the first stored one: the EMAs continue from it and match a
full-history EMA. `update.ts` rolls `ema0` forward as the window drops days, a split rescales it with the history, and a
stock listed inside the window starts TradingView-style (simple average of its first N closes) until its own seed forms.
Seeds came from livermore's history back to 2015 (`pnpm bt ema-seeds`, then `scripts/apply-ema-seeds.mts`).

## How it runs

All data work runs on a Cloudflare Worker (`worker/`, paid Workers plan, up to 5 min CPU per run), including news:
headlines from Bing News RSS (Google News blocks Cloudflare IPs) and Gemini summaries over REST. The Vercel app only
renders pages; its `/api/enrich` route is a fallback the Worker uses while it has no `GEMINI_API_KEY` secret.

- `src/engine/` — pure screening code: NSE parsers and live quotes (`nse.ts`), split/bonus adjustment (`adjust.ts`,
  `update.ts`), screens (`screen.ts`), phases and bases (`series.ts`), levels (`levels.ts`), news (`news.ts`), jobs
  (`jobs.ts`), storage interface (`storage.ts`) and the streamed price-store format (`storefile.ts`).
- `src/engine/core/` — vendored copy of livermore's rule engine (Ankur Patel's setups and scanners). Do not edit here.
- Worker crons (UTC in `worker/wrangler.jsonc`):
  - every 15 min, 17:30–00:29 IST, plus 06:45 IST catch-up: one HEAD request checks for a new NSE bhavcopy; when one
    exists it adds the session (index closes, price bands, corporate actions), rebuilds the screen and track record,
    labels up to 30 unlabelled stocks with their NSE sector, then fetches news for the shortlist.
  - every 5 min, 08:30–16:29 IST on weekdays: live NSE quotes for the watch list (starred, top setups, momentum,
    resuming, breakouts; max 60) while the market is open; every 30 min, new NSE filings.
  - The price store is streamed one stock at a time (Worker memory is 128 MB). All jobs are idempotent and throttled.
- Worker API (CORS *, read by the site): `/api/screen`, `/api/stock/:symbol`, `/api/live`, `/api/live/:symbol`
  (one stock's live quote, cached 60 s), `/api/track`, `/api/runs`, `/api/run/:job` (eod | news | filings | live,
  manual; throttled), `/api/run/eod?rebuild=1` (rebuild the screen from stored prices, e.g. after new sector labels).
- News: shortlist headlines + Gemini verdicts cached per session in R2 `enrich/<date>.json` (only stocks whose filings
  changed are recomputed); stock pages outside the shortlist get headlines fetched by the Worker. Pages revalidate every 5 minutes; the stock page and chart poll live quotes
  every 60 s while the market is open.
- Storage: R2 bucket `stage-two-data` — `prices/head.json` + `prices/stocks.ndjson.gz` (rolling 300 sessions),
  `screens/latest.json`, `screens/<date>.json`, `screens/rows.json`, `news/announcements.json`, `live/latest.json`,
  `runs/log.json`, `track/picks.json`, `meta/*.json` (job state, sector labels).

## Environment

Vercel:

| Variable | |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Blob store for the enrich cache |
| `GEMINI_API_KEY` | News summaries |
| `GEMINI_MODEL` | Optional, comma-separated fallbacks for news summaries (default `gemini-3.5-flash-lite,gemini-3.1-flash-lite`) |
| `AI_PICKS_MODEL` | Optional model order for the daily AI picks (default `gemini-3.6-flash,gemini-3.8-flash`; no light-model fallback, later evening runs retry) |
| `NEXT_PUBLIC_ENGINE_URL` | Optional, Worker URL (default `https://stage-two-engine.prayagdave.workers.dev`) |

Worker: `APP_URL` (in `wrangler.jsonc`), the R2 binding `DATA`, secret `GEMINI_API_KEY`
(`cd worker && npx wrangler secret put GEMINI_API_KEY`, or the Cloudflare dashboard), optional var `GEMINI_MODEL`.
`/api/health` reports `news: "worker"` once the secret is set.

## Development

```bash
pnpm install
vercel env pull .env.local
pnpm dev                        # http://localhost:3000 (reads the deployed Worker)
pnpm test                       # engine unit tests
pnpm worker:deploy              # deploy the Worker
pnpm tsx scripts/upload-sectors.mts sectors.json   # merge NSE sector labels into R2, then /api/run/eod?rebuild=1
```
