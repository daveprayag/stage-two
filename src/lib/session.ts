/**
 * The login cookie: "<expiry ms>.<HMAC-SHA256 of it>", keyed with ENGINE_KEY (Web Crypto, so it runs in middleware).
 * Changing ENGINE_KEY logs every device out.
 */
export const SESSION_COOKIE = "st_session";
export const SESSION_DAYS = 60;

const enc = new TextEncoder();
const b64url = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function mac(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(await crypto.subtle.sign("HMAC", k, enc.encode(`stage-two-session:${msg}`)));
}

export async function makeSession(key: string, now = Date.now()): Promise<{ value: string; maxAge: number }> {
  const maxAge = SESSION_DAYS * 86_400;
  const exp = String(now + maxAge * 1000);
  return { value: `${exp}.${await mac(key, exp)}`, maxAge };
}

export async function validSession(key: string, value: string | undefined, now = Date.now()): Promise<boolean> {
  if (!value) return false;
  const [exp, sig] = value.split(".");
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < now) return false;
  const want = await mac(key, exp);
  if (want.length !== sig.length) return false;
  let d = 0;
  for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}

/** A same-site path to go back to after login (never another site). */
export const safeNext = (n: string | null | undefined) => (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/");
