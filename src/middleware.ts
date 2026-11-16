/**
 * The whole site is private: every page and the engine proxy need the login cookie. Open until ENGINE_KEY is set on
 * Vercel, so nothing locks before the engine and the site share the key.
 */
import { NextResponse, type NextRequest } from "next/server";
import { safeNext, SESSION_COOKIE, validSession } from "@/lib/session";

const OPEN = ["/login", "/api/login", "/api/logout", "/icon.svg", "/favicon.ico", "/robots.txt"];

export async function middleware(req: NextRequest) {
  const key = process.env.ENGINE_KEY;
  const { pathname, search } = req.nextUrl;
  if (!key || OPEN.includes(pathname)) return withNoIndex(NextResponse.next());
  // The engine's news fallback: the Worker calls it with the engine key, not a cookie (the route checks the key).
  if (pathname === "/api/enrich") return NextResponse.next();
  if (await validSession(key, req.cookies.get(SESSION_COOKIE)?.value)) return withNoIndex(NextResponse.next());
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Log in first." }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(safeNext(pathname + search))}`;
  return withNoIndex(NextResponse.redirect(url));
}

function withNoIndex(res: NextResponse): NextResponse {
  res.headers.set("x-robots-tag", "noindex, nofollow");
  return res;
}

export const config = {
  // Everything except Next's own build files.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
