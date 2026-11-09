/**
 * Stage Two scheduler. Cloudflare Cron Triggers (wrangler.jsonc) call the job routes of the Vercel app; the app does
 * the work and throttles itself, so this Worker stays tiny (well inside the free plan's CPU limit).
 * Optional secret: `wrangler secret put CRON_SECRET` (same value as the Vercel env var) to require authorisation.
 */
interface Env {
  APP_URL: string;
  CRON_SECRET?: string;
}

interface Controller {
  cron: string;
  scheduledTime: number;
}

const EVENING = "*/15 12-17 * * *";

async function call(env: Env, path: string): Promise<string> {
  const headers: Record<string, string> = { "user-agent": "stage-two-scheduler" };
  if (env.CRON_SECRET) headers.authorization = `Bearer ${env.CRON_SECRET}`;
  try {
    const res = await fetch(`${env.APP_URL}${path}${path.includes("?") ? "&" : "?"}source=cloudflare`, { headers });
    const body = (await res.json().catch(() => ({}))) as { detail?: string; skipped?: boolean };
    return `${path} ${res.status}${body.skipped ? " (skipped)" : ""}: ${body.detail ?? ""}`;
  } catch (e) {
    return `${path} failed: ${String(e)}`;
  }
}

export default {
  async scheduled(controller: Controller, env: Env): Promise<void> {
    if (controller.cron === EVENING) {
      console.log(await call(env, "/api/cron/eod"));
      console.log(await call(env, "/api/cron/news"));
    } else {
      console.log(await call(env, "/api/cron/filings"));
    }
  },
};
