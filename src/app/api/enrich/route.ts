/**
 * Fallback news enrichment for the Cloudflare engine (POST { asOf, items }), used only while the Worker has no
 * GEMINI_API_KEY secret. Same code as the Worker (src/engine/enrich.ts); cache in Blob enrich/<asOf>.json.
 * Only stocks on the current session's screen are accepted, at most NEWS_MAX per call.
 */
import { NextResponse } from "next/server";
import { readJson, writeJson } from "@/engine/blob";
import { enrich, type EnrichCacheFile } from "@/engine/enrich";
import { NEWS_MAX, type EnrichItem } from "@/engine/jobs";
import type { ScreenFile } from "@/engine/types";
import { engine } from "@/lib/engine";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { asOf?: string; items?: EnrichItem[] } | null;
  if (!body?.asOf || !Array.isArray(body.items)) return NextResponse.json({ error: "asOf and items required" }, { status: 400 });
  const screen = await engine<ScreenFile>("/api/screen");
  if (!screen || screen.asOf !== body.asOf) return NextResponse.json({ error: "asOf is not the current session" }, { status: 409 });
  const allowed = new Set([...screen.rows.map((r) => r.symbol), ...Object.keys(screen.news ?? {})]);
  const items = body.items.filter((i) => allowed.has(i.symbol)).slice(0, NEWS_MAX);
  const key = process.env.GEMINI_API_KEY;
  const out = await enrich(body.asOf, items, key ? { apiKey: key, models: process.env.GEMINI_MODEL } : null, {
    load: (d) => readJson<EnrichCacheFile>(`enrich/${d}.json`, true),
    save: (d, v) => writeJson(`enrich/${d}.json`, v),
  });
  return NextResponse.json(out);
}
