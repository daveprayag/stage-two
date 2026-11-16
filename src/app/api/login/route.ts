/** POST { passcode } → checks it with the engine (the watchlist passcode) and sets the login cookie. */
import { NextResponse } from "next/server";
import { ENGINE_URL, engineAuth } from "@/lib/engine";
import { makeSession, SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = process.env.ENGINE_KEY;
  if (!key) return NextResponse.json({ error: "The site lock isn't set up yet (ENGINE_KEY on Vercel)." }, { status: 503 });
  const { passcode } = ((await req.json().catch(() => null)) ?? {}) as { passcode?: string };
  if (!passcode) return NextResponse.json({ error: "Enter the passcode." }, { status: 400 });
  const res = await fetch(`${ENGINE_URL}/api/watchlist/check`, { cache: "no-store", headers: { ...engineAuth(), "x-watch-key": passcode } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return NextResponse.json({ error: res.status === 401 ? "Wrong passcode." : body.error ?? `Engine answered HTTP ${res.status}` }, { status: res.status === 401 ? 401 : 502 });
  }
  const s = await makeSession(key);
  const out = NextResponse.json({ ok: true });
  out.cookies.set(SESSION_COOKIE, s.value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: s.maxAge });
  return out;
}
