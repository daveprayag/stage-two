/**
 * Headlines + Gemini summaries for the Cloudflare engine (POST { asOf, items }). Lives on Vercel because Google News
 * blocks Cloudflare and the Gemini key is here. Only stocks on the current session's news shortlist are accepted, and
 * results are saved per session and per stock's filings (Blob enrich/<asOf>.json), so repeated calls cost nothing.
 */
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/engine/blob";
import { newsShortlist, type EnrichItem } from "@/engine/jobs";
import { fetchHeadlines, verdicts } from "@/engine/news";
import type { Headline, NewsVerdict, ScreenFile, ScreenRow } from "@/engine/types";
import { engine } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Entry = { key: string; headlines: Headline[]; ai: NewsVerdict | null };

const keyOf = (i: EnrichItem) => {
  let h = 0;
  for (const ch of JSON.stringify(i.filings)) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return String(h);
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { asOf?: string; items?: EnrichItem[] } | null;
  if (!body?.asOf || !Array.isArray(body.items)) return NextResponse.json({ error: "asOf and items required" }, { status: 400 });
  const screen = await engine<ScreenFile>("/api/screen", 0);
  if (!screen || screen.asOf !== body.asOf) return NextResponse.json({ error: "asOf is not the current session" }, { status: 409 });
  const allowed = new Set([...newsShortlist(screen.rows).map((r) => r.symbol), ...Object.keys(screen.news ?? {})]);
  const items = body.items.filter((i) => allowed.has(i.symbol)).slice(0, 60);
  const cachePath = `enrich/${body.asOf}.json`;
  const cache = (await readJson<Record<string, Entry>>(cachePath, true)) ?? {};
  const todo = items.filter((i) => cache[i.symbol]?.key !== keyOf(i) || !cache[i.symbol]?.ai);
  if (todo.length) {
    // Google News, four at a time.
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
      const res = await Promise.allSettled(batches.map((b) => verdicts(b.map((i) => ({ row: i as unknown as ScreenRow, filings: i.filings, headlines: heads[i.symbol] ?? [] })))));
      for (const r of res) if (r.status === "fulfilled") Object.assign(ai, r.value);
    };
    await ask(todo, 12);
    const missing = todo.filter((i) => !ai[i.symbol]);
    if (missing.length) await ask(missing, 6);
    for (const i of todo) cache[i.symbol] = { key: keyOf(i), headlines: heads[i.symbol] ?? [], ai: ai[i.symbol] ?? cache[i.symbol]?.ai ?? null };
    await writeJson(cachePath, cache);
  }
  const news = Object.fromEntries(items.map((i) => [i.symbol, { headlines: cache[i.symbol]?.headlines ?? [], ai: cache[i.symbol]?.ai ?? null }]));
  return NextResponse.json({ news, computed: todo.length });
}
