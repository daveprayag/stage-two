/**
 * Cron routes are safe to call repeatedly (each job skips work already done), so they stay callable without a
 * secret. When CRON_SECRET is set (Vercel Cron then sends it as a bearer token), it is required, and only an
 * authorised call may force a re-run.
 */
export function cronAccess(req: Request): { allowed: boolean; privileged: boolean } {
  const secret = process.env.CRON_SECRET;
  const authorised = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  return { allowed: !secret || authorised, privileged: authorised };
}
