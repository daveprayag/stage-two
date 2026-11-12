/**
 * News enrichment for the shortlist: headlines (Bing News, Google fallback) and Gemini verdicts, cached per session.
 * A stock is recomputed only when its filings changed or it has no verdict yet, so repeated runs cost nothing.
 * Runs in the Cloudflare Worker (key in the Worker secret GEMINI_API_KEY); the Vercel /api/enrich route uses it too.
 */
import type { EnrichItem } from "./jobs";
import { fetchHeadlines, verdicts, type GeminiConfig } from "./news";
import type { Headline, ISODate, NewsVerdict, ScreenRow } from "./types";

export interface EnrichEntry {
  key: string;
  headlines: Headline[];
  ai: NewsVerdict | null;
}
export type EnrichCacheFile = Record<string, EnrichEntry>;

export interface EnrichCache {
  load(asOf: ISODate): Promise<EnrichCacheFile | null>;
  save(asOf: ISODate, value: EnrichCacheFile): Promise<void>;
}

/** Changes whenever the stock's filings or its latest results figures change. */
export function enrichKey(i: EnrichItem): string {
  let h = 0;
  // "v3": the prompt changed (results figures, temperature 0); bump to make every stock's verdict recompute once.
  for (const ch of JSON.stringify(["v3", i.filings, i.results ? [i.results.qe, i.results.now] : null])) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return String(h);
}

export async function enrich(
  asOf: ISODate,
  items: EnrichItem[],
  gemini: GeminiConfig | null,
  cache: EnrichCache,
): Promise<{ news: Record<string, { headlines: Headline[]; ai: NewsVerdict | null }>; computed: number }> {
  const store = (await cache.load(asOf)) ?? {};
  const todo = items.filter((i) => store[i.symbol]?.key !== enrichKey(i) || !store[i.symbol]?.ai);
  if (todo.length) {
    // Headlines, four at a time.
    const heads: Record<string, Headline[]> = {};
    for (let k = 0; k < todo.length; k += 4) {
      const part = todo.slice(k, k + 4);
      const got = await Promise.all(part.map((i) => fetchHeadlines(i.name, i.symbol).catch(() => [])));
      part.forEach((i, j) => (heads[i.symbol] = got[j] ?? []));
    }
    // Gemini in batches of 12, then a retry pass in sixes for any still missing.
    const ai: Record<string, NewsVerdict> = {};
    const ask = async (list: EnrichItem[], size: number) => {
      const batches: EnrichItem[][] = [];
      for (let k = 0; k < list.length; k += size) batches.push(list.slice(k, k + size));
      // The prompt reads only the row fields EnrichItem carries.
      const res = await Promise.allSettled(
        batches.map((b) => verdicts(b.map((i) => ({ row: i as unknown as ScreenRow, filings: i.filings, headlines: heads[i.symbol] ?? [], results: i.results ?? null })), gemini)),
      );
      for (const r of res) if (r.status === "fulfilled") Object.assign(ai, r.value);
    };
    await ask(todo, 12);
    const missing = todo.filter((i) => !ai[i.symbol]);
    if (missing.length) await ask(missing, 6);
    for (const i of todo) store[i.symbol] = { key: enrichKey(i), headlines: heads[i.symbol] ?? [], ai: ai[i.symbol] ?? store[i.symbol]?.ai ?? null };
    await cache.save(asOf, store);
  }
  const news = Object.fromEntries(items.map((i) => [i.symbol, { headlines: store[i.symbol]?.headlines ?? [], ai: store[i.symbol]?.ai ?? null }]));
  return { news, computed: todo.length };
}
