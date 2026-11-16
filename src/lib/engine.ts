/** The Cloudflare Worker that computes and stores everything (worker/). */
export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "https://stage-two-engine.prayagdave.workers.dev";

/** What the browser calls: the site's own proxy (app/api/engine), which needs the login cookie and adds the engine key. */
export const BROWSER_ENGINE = "/api/engine";

/** Headers that open the engine once it is locked (ENGINE_KEY set on both the Worker and Vercel). Server only. */
export const engineAuth = (): Record<string, string> => (process.env.ENGINE_KEY ? { "x-engine-key": process.env.ENGINE_KEY } : {});

/**
 * Read from the engine, always fresh (no cache anywhere in between): pages never show an older copy while a newer one
 * exists. 404 → null (no such thing); any other failure throws, and the route's error page says so.
 */
export async function engine<T>(path: string): Promise<T | null> {
  const res = await fetch(`${ENGINE_URL}${path}`, { cache: "no-store", headers: engineAuth() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Stage Two engine: ${path} answered HTTP ${res.status}`);
  return (await res.json()) as T;
}
