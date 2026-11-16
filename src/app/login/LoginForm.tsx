"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { savePasscode } from "@/components/watch";

/** The passcode once per device: it opens the site, and holdings and watchlist changes, without asking again. */
export function LoginForm({ next }: { next: string }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode: v }) });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      savePasscode(v);
      window.location.href = next;
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label htmlFor="site-pass" className="text-xs text-ink-3">
        Passcode
      </label>
      <input
        id="site-pass"
        type="password"
        autoComplete="current-password"
        autoFocus
        value={v}
        onChange={(e) => setV(e.target.value)}
        className="h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-line-strong"
      />
      <button type="submit" disabled={busy || !v} className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-ink px-3 text-sm text-bg disabled:opacity-50">
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Checking…" : "Log in"}
      </button>
      {err && (
        <p role="alert" className="text-xs text-down">
          {err}
        </p>
      )}
    </form>
  );
}
