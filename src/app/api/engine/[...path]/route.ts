/**
 * The browser's way to the engine: same site, so the login cookie guards it (middleware), and the engine key is added
 * here. Passes the passcode header through for holdings and watchlist changes.
 */
import { ENGINE_URL, engineAuth } from "@/lib/engine";

export const dynamic = "force-dynamic";

async function forward(req: Request, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const headers: Record<string, string> = { ...engineAuth() };
  const pass = req.headers.get("x-watch-key");
  if (pass) headers["x-watch-key"] = pass;
  const type = req.headers.get("content-type");
  if (type) headers["content-type"] = type;
  const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
  const res = await fetch(`${ENGINE_URL}/api/${path.map(encodeURIComponent).join("/")}${url.search}`, { method: req.method, headers, body, cache: "no-store" });
  return new Response(res.body, { status: res.status, headers: { "content-type": res.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
}

export { forward as GET, forward as POST, forward as DELETE };
