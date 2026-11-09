# Stage Two

End-of-day momentum screener for NSE stocks. Every evening it adds the day's NSE data, finds stocks entering or leading
an uptrend, and attaches the news behind each move (NSE filings, headlines, a Gemini summary).

Formerly *StockGenius* (Yahoo Finance, ~380 hardcoded symbols). Now every EQ stock on NSE from NSE's own files.

## Screens

| Screen | Rule |
| --- | --- |
| Momentum leaders | RS ≥ 80, 20-day ADR in the top 40% of liquid stocks, industry in the top 40% by median 3-month return, stage 2 (livermore "Winner patterns": hit +50% in 6 months 47% vs 29% for all stocks, out of sample) |
| Resuming after a pause | Rallied 20%+, paused 5+ sessions within 25%, closed back above the pause top in the last 5 sessions, ≤ 8% above it; stop = pause low |
| Breaking out | Close above the top of a ≥ 8-week base on ≥ 1.5× average volume, in stage 2 (or trend template ≥ 6/8) |
| Tight near highs | Trend template ≥ 7/8, within 15% of the 52-week high, 10-day range ≤ 12%, 5/50-day volume ≤ 0.9 |
| New uptrends | Entered stage 2 in the last 30 sessions, RS ≥ 70, template ≥ 6/8, within 25% of the high |
| Strongest | RS ≥ 90 and trend template ≥ 7/8 |
| Ankur's scans | Ankur Patel's Chartink scans (volume, 20 EMA, flag) or a setup from the livermore rule engine |

Star (★): a momentum leader that passes at least 5 of 6 checks (momentum profile, early/mid phase, RS ≥ 90, 3+ strong
stocks in its industry, positive news without red flags, resuming after a pause with a stop ≤ 12%). Market (NIFTY 500 vs
its 200-day) is shown but not counted. A summary of the Guide's selection steps, not a separately tested signal.

Phase (stage 2 only): rallies (20%+ without a 10% pullback) counted from when the stock left its latest side-trend base
(40+ sessions within a 35% range, ending within 12% of where it started, 50-day average moving at most 5%). Early = in
or just out of the base, or the first rally; mid = second; late = third or later, any 80%+ rally, or no base in the
~14 months of history. The screener can show early only or early + mid; top setups must not be late.

Universe: EQ series, not ETFs/index funds, close > ₹30, 50-day average traded value ≥ ₹2 Cr, not in the 2% / 5% price bands.
Stage = Weinstein stage from the 150-day average; RS = percentile of 3/6/9/12-month returns (latest quarter double).
Support/resistance = clusters of swing highs/lows (5 bars each side, 2.5% tolerance); trendlines = longest line through
two rising lows / falling highs that no close has broken. These are shortlists, not tested buy signals (see /guide).

## How it runs

All data work runs on a Cloudflare Worker (`worker/`, paid Workers plan, up to 5 min CPU per run); the Vercel app
only renders pages and does the one step Cloudflare can't (Google News blocks Cloudflare IPs; the Gemini key lives on
Vercel).

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
- Vercel: `/api/enrich` (POST from the Worker) returns Google News headlines and Gemini summaries for the shortlist,
  cached per session in Vercel Blob. Pages revalidate every 5 minutes; the stock page and chart poll live quotes
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
| `GEMINI_MODEL` | Optional, comma-separated fallbacks (default `gemini-flash-lite-latest,gemini-3.5-flash-lite,gemini-3.1-flash-lite`) |
| `NEXT_PUBLIC_ENGINE_URL` | Optional, Worker URL (default `https://stage-two-engine.prayagdave.workers.dev`) |

Worker: `APP_URL` (in `wrangler.jsonc`) and the R2 binding `DATA`. No secrets.

## Development

```bash
pnpm install
vercel env pull .env.local
pnpm dev                        # http://localhost:3000 (reads the deployed Worker)
pnpm test                       # engine unit tests
pnpm worker:deploy              # deploy the Worker
pnpm tsx scripts/upload-sectors.mts sectors.json   # merge NSE sector labels into R2, then /api/run/eod?rebuild=1
```
