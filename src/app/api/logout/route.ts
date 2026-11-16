/** Clears the login cookie and goes to the login page. */
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const out = NextResponse.redirect(new URL("/login?out=1", req.url));
  out.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return out;
}
