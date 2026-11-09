import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import type { JobOptions } from "@/engine/pipeline";
import type { RunRecord } from "@/engine/types";

/**
 * Job routes are safe to call repeatedly (each job is throttled and skips work already done), so they stay
 * callable without a secret. When CRON_SECRET is set it is required, and only an authorised call may force a re-run.
 */
export function cronAccess(req: Request): { allowed: boolean; privileged: boolean } {
  const secret = process.env.CRON_SECRET;
  const authorised = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  return { allowed: !secret || authorised, privileged: authorised };
}

/** Shared handler: auth, source label, run, refresh cached pages when something changed. */
export async function handleJob(req: Request, run: (o: JobOptions) => Promise<RunRecord>) {
  const { allowed, privileged } = cronAccess(req);
  if (!allowed) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const url = new URL(req.url);
  const ua = req.headers.get("user-agent") ?? "";
  const source = ua.includes("vercel-cron") ? "vercel" : (url.searchParams.get("source") ?? "manual").slice(0, 20);
  const rec = await run({ force: privileged && url.searchParams.get("force") === "1", source });
  if (rec.ok && !rec.skipped) revalidatePath("/", "layout");
  return NextResponse.json(rec, { status: rec.ok ? 200 : 500 });
}
