/** The Cloudflare Worker that computes and stores everything (worker/). */
export const ENGINE_URL = process.env.NEXT_PUBLIC_ENGINE_URL ?? "https://stage-two-engine.prayagdave.workers.dev";

export async function engine<T>(path: string, revalidate = 300): Promise<T | null> {
  try {
    const res = await fetch(`${ENGINE_URL}${path}`, { next: { revalidate } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
