/**
 * News for shortlisted stocks:
 *  - NSE corporate announcements (official filings: results, orders, acquisitions, fund raises), one request a day.
 *  - News headlines per company (last 14 days): Bing News RSS (reachable from Cloudflare), Google News RSS as fallback.
 *  - A Gemini read of both: one-line summary, sentiment, catalysts and red flags. It only summarises what the
 *    filings and headlines say; it does not predict prices.
 */
import { XMLParser } from "fast-xml-parser";
import { UA } from "./nse";
import { resultsLine, type StockResults } from "./financials";
import type { Filing, Headline, NewsVerdict, ScreenRow } from "./types";

/** "BHARAT ELECTRONICS LTD" → "Bharat Electronics" (news search query). */
export function companyQuery(name: string, symbol: string): string {
  const cleaned = name
    .replace(/\b(limited|ltd\.?|ltd|pvt|private|\(india\)|india ltd)\b/gi, " ")
    .replace(/[^A-Za-z0-9&.\- ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned.length < 3) return symbol;
  return cleaned
    .toLowerCase()
    .split(" ")
    .map((w) => (w.length <= 3 && /^[a-z]+$/.test(w) && w !== "and" ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

export function googleNewsUrl(query: string, days = 14): string {
  const q = encodeURIComponent(`"${query}" when:${days}d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

export function parseGoogleNews(text: string, max = 6): Headline[] {
  const doc = xml.parse(text) as { rss?: { channel?: { item?: unknown } } };
  const raw = doc.rss?.channel?.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];
  const out: Headline[] = [];
  for (const it of items.slice(0, max)) {
    const src = it.source as { "#text"?: string } | string | undefined;
    const source = typeof src === "string" ? src : (src?.["#text"] ?? "");
    let title = String(it.title ?? "");
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const d = new Date(String(it.pubDate ?? ""));
    out.push({ title, source, url: String(it.link ?? ""), date: Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10) });
  }
  return out;
}

export function bingNewsUrl(query: string): string {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(`"${query}"`)}&format=rss&setlang=en-IN&cc=IN`;
}

/** Bing wraps article links in a click-tracker; the real URL is its url= parameter. */
function bingTarget(link: string): string {
  try {
    return new URL(link).searchParams.get("url") ?? link;
  } catch {
    return link;
  }
}

/** Bing News RSS → headlines from the last `days` days, newest first. */
export function parseBingNews(text: string, now: Date, max = 6, days = 14): Headline[] {
  const doc = xml.parse(text) as { rss?: { channel?: { item?: unknown } } };
  const raw = doc.rss?.channel?.item;
  const items = (Array.isArray(raw) ? raw : raw ? [raw] : []) as Record<string, unknown>[];
  const cutoff = now.getTime() - days * 86_400_000;
  const out: (Headline & { t: number })[] = [];
  for (const it of items) {
    const d = new Date(String(it.pubDate ?? ""));
    const t = d.getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
    const source = String(it["News:Source"] ?? "").replace(/ on MSN$/, "");
    out.push({ title: String(it.title ?? ""), source, url: bingTarget(String(it.link ?? "")), date: d.toISOString().slice(0, 10), t });
  }
  return out
    .sort((a, b) => b.t - a.t)
    .slice(0, max)
    .map((h) => ({ title: h.title, source: h.source, url: h.url, date: h.date }));
}

async function getText(url: string): Promise<string | null> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml,text/xml,*/*" }, signal: AbortSignal.timeout(15_000) });
  return res.ok ? res.text() : null;
}

export async function fetchHeadlines(name: string, symbol: string): Promise<Headline[]> {
  const q = companyQuery(name, symbol);
  const bing = await getText(bingNewsUrl(q)).catch(() => null);
  const fromBing = bing ? parseBingNews(bing, new Date()) : [];
  if (fromBing.length) return fromBing;
  // Google News blocks Cloudflare (503) but works elsewhere.
  const google = await getText(googleNewsUrl(q)).catch(() => null);
  return google ? parseGoogleNews(google) : [];
}

/**
 * News summaries: many small requests a day, so the light models (free tier, stable, fixed versions rather than
 * "-latest" aliases, which Google re-points on each release). Checked against Google's model and pricing pages 2026-11-10.
 */
/** Strip the AI provider's and model's names from text the site shows (errors, logs): "AI" only. */
export const genericAi = (s: string): string =>
  s.replace(/generativelanguage\.googleapis\.com[^\s"']*/gi, "AI service").replace(/\bgemini[\w.-]*/gi, "AI model").replace(/\bgoogle ai\b/gi, "AI");

export const DEFAULT_GEMINI_MODELS = "gemini-3.5-flash-lite,gemini-3.1-flash-lite";

export interface GeminiConfig {
  apiKey: string;
  /** Comma-separated, tried in order. */
  models?: string;
}
const GEMINI_TIMEOUT_MS = 75_000;

interface VerdictInput {
  row: ScreenRow;
  filings: Filing[];
  headlines: Headline[];
  /** Latest quarter's figures from the company's NSE results filing. */
  results?: StockResults | null;
}

function promptFor(items: VerdictInput[]): string {
  const blocks = items.map(({ row, filings, headlines, results }) => {
    const f = filings.slice(0, 6).map((x) => `  - [${x.date}] ${x.category}: ${x.text}`).join("\n") || "  (none)";
    const h = headlines.slice(0, 6).map((x) => `  - [${x.date}] ${x.title} (${x.source})`).join("\n") || "  (none)";
    return `### ${row.symbol} — ${row.name} (${row.industry ?? "industry unknown"})
Price action: ${row.chgPct.toFixed(1)}% today, ${row.ret1m?.toFixed(1) ?? "?"}% in 1 month, ${row.pctFromHigh.toFixed(1)}% below its 52-week high, stage ${row.stage}${row.breakout ? ", broke out today on heavy volume" : ""}.
${results ? `Latest results, from the company's NSE filing: ${resultsLine(results)}\n` : ""}NSE filings (last 3 weeks):
${f}
News headlines (last 2 weeks):
${h}`;
  });
  return `You review news for Indian (NSE) stocks that a momentum screener flagged. For each stock, read ONLY the filings and headlines given and report:
- summary: at most 35 words on what the company-specific news is (orders, results, guidance, deals, regulatory issues, management changes). If there is no company-specific news, say so.
- sentiment: "positive", "negative" or "neutral" for the news itself; "none" if there is no relevant news.
- catalysts: up to 3 short phrases (e.g. "Q2 profit +40% YoY", "₹1,200 Cr defence order").
- redFlags: up to 3 short phrases on business or governance risk only (e.g. "promoter pledge", "SEBI notice", "auditor resignation", "large equity dilution", "profit warning"). Personal or crime news about current or former staff is not a red flag unless it affects the business. Empty if none.
Where "Latest results" figures are given, they come from the company's own exchange filing in the last 3 weeks: judge the results on those figures (growth against the same quarter a year earlier), even when the filing title only says results were submitted. Strong growth goes in the catalysts; weak or falling figures go in the summary and lower the sentiment, but are not red flags (red flags stay business or governance risks).
Do not predict prices, do not give advice, do not use outside knowledge, and ignore generic market-wrap headlines that only mention the stock in a list.

${blocks.join("\n\n")}`;
}

const VERDICT_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      symbol: { type: "STRING" },
      summary: { type: "STRING" },
      sentiment: { type: "STRING", enum: ["positive", "negative", "neutral", "none"] },
      catalysts: { type: "ARRAY", items: { type: "STRING" } },
      redFlags: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["symbol", "summary", "sentiment", "catalysts", "redFlags"],
  },
};

/**
 * One structured-JSON request to the AI model (REST, works in Node and Workers), trying `models` in order: a busy or
 * over-quota model (503/429/500, timeout) gets a second try, then the next model; an unknown model (404) moves on at once.
 * Returns the JSON text and which model answered.
 */
export async function askModel(
  prompt: string,
  schema: unknown,
  cfg: GeminiConfig,
  opts: { models?: string; timeoutMs?: number; temperature?: number; attempts?: number; waitMs?: number } = {},
): Promise<{ text: string; model: string; skipped: string[] }> {
  const body = JSON.stringify({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: schema, ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}) },
  });
  const request = async (model: string): Promise<string> => {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? GEMINI_TIMEOUT_MS),
    });
    const text = await res.text();
    // The provider and model stay unnamed in anything the site shows (user, 2026-11): "AI" only.
    if (!res.ok) throw new Error(`AI model HTTP ${res.status}: ${genericAi(text.slice(0, 200))}`);
    const json = JSON.parse(text) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return json.candidates?.[0]?.content?.parts?.map((x) => x.text ?? "").join("") ?? "";
  };
  let lastError: unknown = null;
  const skipped: string[] = [];
  for (const model of (opts.models || cfg.models || DEFAULT_GEMINI_MODELS).split(",").map((m) => m.trim()).filter(Boolean)) {
    for (let attempt = 0; attempt < (opts.attempts ?? 2); attempt++) {
      try {
        return { text: await request(model), model, skipped };
      } catch (e) {
        lastError = e;
        skipped.push(String(e instanceof Error ? e.message : e).slice(0, 160));
        if (!/\b(503|429|500)\b|overloaded|high demand|timeout|abort/i.test(String(e))) break;
        await new Promise((r) => setTimeout(r, (opts.waitMs ?? 3000) * (attempt + 1)));
      }
    }
  }
  throw lastError ?? new Error("AI: no model answered");
}

/** One AI request for a batch of stocks → verdict per symbol (missing on failure). */
export async function verdicts(items: VerdictInput[], cfg: GeminiConfig | null): Promise<Record<string, NewsVerdict>> {
  if (!cfg?.apiKey || !items.length) return {};
  // Temperature 0: the same filings and figures should get the same verdict on every run.
  const answer = (await askModel(promptFor(items), VERDICT_SCHEMA, cfg, { temperature: 0 })).text || "[]";
  const parsed = JSON.parse(answer) as (NewsVerdict & { symbol: string })[];
  const out: Record<string, NewsVerdict> = {};
  for (const v of parsed) {
    if (!v?.symbol) continue;
    out[v.symbol.toUpperCase()] = {
      summary: v.summary,
      sentiment: v.sentiment,
      catalysts: (v.catalysts ?? []).slice(0, 3),
      redFlags: (v.redFlags ?? []).slice(0, 3),
    };
  }
  return out;
}
