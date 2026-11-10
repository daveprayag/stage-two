/** The Cloudflare Worker that computes and stores everything (worker/). */
export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "https://stage-two-engine.prayagdave.workers.dev";

/**
 * Read from the engine, always fresh (no cache anywhere in between): pages never show an older copy while a newer one
 * exists. 404 → null (no such thing); any other failure throws, and the route's error page says so.
 */
export async function engine<T>(path: string): Promise<T | null> {
  const res = await fetch(`${ENGINE_URL}${path}`, { cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Stage Two engine: ${path} answered HTTP ${res.status}`);
  return (await res.json()) as T;
}
