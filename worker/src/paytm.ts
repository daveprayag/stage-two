/**
 * Paytm Money, read-only. The only two calls are: exchanging the login's request token (keeping only the read-only
 * token, which cannot place orders) and reading demat holdings. There is deliberately no order, modify or cancel
 * endpoint anywhere in this code, and the full-access token Paytm Money also returns is never stored.
 *
 * Login: https://login.paytmmoney.com/merchant-login?apiKey=…&state=… → the user signs in (password, OTP, passcode)
 * → Paytm Money redirects to the app's registered redirect URL with ?requestToken=… → POST /accounts/v2/gettoken.
 * Endpoints as in Paytm Money's own SDK (github.com/paytmmoney/pyPMClient, pmClient/constants.py).
 */
import { jwtExpiry } from "../../src/engine/holdings";

const HOST = "https://developer.paytmmoney.com";
const LOGIN = "https://login.paytmmoney.com/merchant-login";
/** Every Paytm Money path this code can call. */
const PATHS = { token: "/accounts/v2/gettoken", holdings: "/holdings/v1/get-user-holdings-data" } as const;

export class PaytmAuthError extends Error {}

export const loginUrl = (apiKey: string, state: string) => `${LOGIN}?apiKey=${encodeURIComponent(apiKey)}&state=${encodeURIComponent(state)}`;

/** Paytm Money's error text, if any (error answers carry no tokens). */
function message(body: unknown): string {
  const b = body as { message?: unknown; errors?: { message?: unknown }[] } | null;
  const m = typeof b?.message === "string" ? b.message : b?.errors?.map((e) => e.message).filter((x) => typeof x === "string").join("; ");
  return m ? `: ${String(m).slice(0, 200)}` : "";
}

/** Request token → the read-only token and its expiry. The other tokens in the answer are dropped here. */
export async function exchangeToken(apiKey: string, secret: string, requestToken: string): Promise<{ read: string; expiresAt: string | null }> {
  const res = await fetch(HOST + PATHS.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, api_secret_key: secret, request_token: requestToken }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) throw new Error(`Paytm Money login failed (HTTP ${res.status})${message(body)}`);
  const read = typeof body?.read_access_token === "string" && body.read_access_token ? body.read_access_token : null;
  if (!read) throw new Error("Paytm Money did not return a read-only token, so nothing was saved.");
  return { read, expiresAt: jwtExpiry(read) };
}

/** Demat holdings with the read-only token; PaytmAuthError when the session has ended. */
export async function fetchHoldings(readToken: string): Promise<unknown> {
  const res = await fetch(HOST + PATHS.holdings, {
    headers: { "x-jwt-token": readToken, "content-type": "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as unknown;
  if (res.status === 401 || res.status === 403) throw new PaytmAuthError(`Paytm Money session ended${message(body)}`);
  if (!res.ok) throw new Error(`Paytm Money holdings: HTTP ${res.status}${message(body)}`);
  return body;
}
