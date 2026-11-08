/**
 * News for shortlisted stocks:
 *  - NSE corporate announcements (official filings: results, orders, acquisitions, fund raises), one request a day.
 *  - Google News RSS headlines per company (last 14 days).
 *  - A Gemini read of both: one-line summary, sentiment, catalysts and red flags. It only summarises what the
 *    filings and headlines say; it does not predict prices.
 */
import { GoogleGenAI, Type } from "@google/genai";
import { XMLParser } from "fast-xml-parser";
import { UA } from "./nse";
import type { Filing, Headline, NewsVerdict, ScreenRow } from "./types";

/** "BHARAT ELECTRONICS LTD" → "Bharat Electronics" (search query for Google News). */
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

export async function fetchHeadlines(name: string, symbol: string): Promise<Headline[]> {
  const res = await fetch(googleNewsUrl(companyQuery(name, symbol)), {
    headers: { "User-Agent": UA, Accept: "application/rss+xml,text/xml,*/*" },
    signal: AbortSignal.timeout(15_000),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  return parseGoogleNews(await res.text());
}

/** Lite models answer a batch in ~10 s; the full flash model was overloaded (503s, minutes per call) when tested. */
export const GEMINI_MODELS = (process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest,gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map((m) => m.trim());
const GEMINI_TIMEOUT_MS = 75_000;

interface VerdictInput {
  row: ScreenRow;
  filings: Filing[];
  headlines: Headline[];
}

function promptFor(items: VerdictInput[]): string {
  const blocks = items.map(({ row, filings, headlines }) => {
    const f = filings.slice(0, 6).map((x) => `  - [${x.date}] ${x.category}: ${x.text}`).join("\n") || "  (none)";
    const h = headlines.slice(0, 6).map((x) => `  - [${x.date}] ${x.title} (${x.source})`).join("\n") || "  (none)";
    return `### ${row.symbol} — ${row.name} (${row.industry ?? "industry unknown"})
Price action: ${row.chgPct.toFixed(1)}% today, ${row.ret1m?.toFixed(1) ?? "?"}% in 1 month, ${row.pctFromHigh.toFixed(1)}% below its 52-week high, stage ${row.stage}${row.breakout ? ", broke out today on heavy volume" : ""}.
NSE filings (last 3 weeks):
${f}
News headlines (last 2 weeks):
${h}`;
  });
  return `You review news for Indian (NSE) stocks that a momentum screener flagged. For each stock, read ONLY the filings and headlines given and report:
- summary: at most 35 words on what the company-specific news is (orders, results, guidance, deals, regulatory issues, management changes). If there is no company-specific news, say so.
- sentiment: "positive", "negative" or "neutral" for the news itself; "none" if there is no relevant news.
- catalysts: up to 3 short phrases (e.g. "Q2 profit +40% YoY", "₹1,200 Cr defence order").
- redFlags: up to 3 short phrases on business or governance risk only (e.g. "promoter pledge", "SEBI notice", "auditor resignation", "large equity dilution", "profit warning"). Personal or crime news about current or former staff is not a red flag unless it affects the business. Empty if none.
Do not predict prices, do not give advice, do not use outside knowledge, and ignore generic market-wrap headlines that only mention the stock in a list.

${blocks.join("\n\n")}`;
}

/** One Gemini call for a batch of stocks → verdict per symbol (missing on failure). */
export async function verdicts(items: VerdictInput[]): Promise<Record<string, NewsVerdict>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key || !items.length) return {};
  const ai = new GoogleGenAI({ apiKey: key });
  const request = (model: string) =>
    ai.models.generateContent({
      model,
      contents: promptFor(items),
      config: {
        abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              symbol: { type: Type.STRING },
              summary: { type: Type.STRING },
              sentiment: { type: Type.STRING, enum: ["positive", "negative", "neutral", "none"] },
              catalysts: { type: Type.ARRAY, items: { type: Type.STRING } },
              redFlags: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["symbol", "summary", "sentiment", "catalysts", "redFlags"],
          },
        },
      },
    });
  let res: Awaited<ReturnType<typeof request>> | null = null;
  let lastError: unknown = null;
  // Busy models return 503: try each model twice, a few seconds apart.
  outer: for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await request(model);
        break outer;
      } catch (e) {
        lastError = e;
        if (!/\b(503|429|500)\b|overloaded|high demand|timeout|abort/i.test(String(e))) break;
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }
  if (!res) throw lastError ?? new Error("Gemini: no model answered");
  const parsed = JSON.parse(res.text ?? "[]") as (NewsVerdict & { symbol: string })[];
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
