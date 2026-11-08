# Stage Two

End-of-day momentum screener for NSE stocks. Every evening it adds the day's NSE data, finds stocks entering or leading
an uptrend, and attaches the news behind each move (NSE filings, headlines, a Gemini summary).

Formerly *StockGenius* (Yahoo Finance, ~380 hardcoded symbols). Now every EQ stock on NSE from NSE's own files.

## Screens

| Screen | Rule |
| --- | --- |
| Breakouts | Close above the top of a ≥ 8-week base on ≥ 1.5× average volume, in stage 2 (or trend template ≥ 6/8) |
| Setting up | Trend template ≥ 7/8, within 15% of the 52-week high, 10-day range ≤ 12%, 5/50-day volume ≤ 0.9 |
| Fresh stage 2 | Entered stage 2 in the last 30 sessions, RS ≥ 70, template ≥ 6/8, within 25% of the high |
| Leaders | RS ≥ 90 and trend template ≥ 7/8 |
| Ankur's scans | Ankur Patel's Chartink scans (volume, 20 EMA, flag) or a setup from the livermore rule engine |

Universe: EQ series, close > ₹30, 50-day average traded value ≥ ₹2 Cr, not in the 2% / 5% price bands.
Stage = Weinstein stage from the 150-day average; RS = percentile of 3/6/9/12-month returns (latest quarter double).
Support/resistance = clusters of swing highs/lows (5 bars each side, 2.5% tolerance); trendlines = longest line through
two rising lows / falling highs that no close has broken. These are shortlists, not tested buy signals (see /guide).

## How it runs

- `src/engine/` — pure screening code: NSE parsers (`nse.ts`), split/bonus adjustment (`adjust.ts`, `update.ts`),
  screens (`screen.ts`), levels (`levels.ts`), news (`news.ts`), jobs (`pipeline.ts`), Blob storage (`blob.ts`).
- `src/engine/core/` — vendored copy of livermore's rule engine (Ankur Patel's setups and scanners). Do not edit here.
- Vercel Cron (`vercel.json`): `/api/cron/eod` at 21:00 IST adds new sessions (and catches up any missed days) from the NSE bhavcopy,
  index closes, price bands and corporate actions, then rebuilds the screen; `/api/cron/news` at 22:30 IST adds NSE
  filings, Google News headlines and Gemini summaries for the top 60. Both are idempotent. History: `/runs`.
- Storage: private Vercel Blob store `stage-two-data` (`prices/latest.json.gz` rolling 300 sessions,
  `screens/<date>.json` per session, `news/announcements.json`, `runs/log.json`).

## Environment

| Variable | |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Blob store (added when the store was connected) |
| `GEMINI_API_KEY` | News summaries |
| `GEMINI_MODEL` | Optional, comma-separated fallbacks (default `gemini-flash-lite-latest,gemini-3.5-flash-lite,gemini-3.1-flash-lite`) |
| `CRON_SECRET` | Optional. When set, cron routes require it (Vercel Cron sends it) and `?force=1` re-runs are allowed |

## Development

```bash
pnpm install
vercel env pull .env.local
pnpm dev                       # http://localhost:3000
pnpm test                      # engine unit tests
pnpm job eod | news [--force]  # run a nightly job locally against Blob
pnpm bootstrap <prices.json.gz> # one-time: seed Blob from a livermore export
```
