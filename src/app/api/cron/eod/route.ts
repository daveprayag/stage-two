import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { runEod } from "@/engine/pipeline";
import { cronAccess } from "@/lib/cronAuth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const { allowed, privileged } = cronAccess(req);
  if (!allowed) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  const force = privileged && new URL(req.url).searchParams.get("force") === "1";
  const rec = await runEod({ force });
  if (rec.ok) revalidatePath("/", "layout");
  return NextResponse.json(rec, { status: rec.ok ? 200 : 500 });
}
