"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { addToWatchlist, checkPasscode, loadWatchedSymbols, removeFromWatchlist, savedPasscode, savePasscode, WatchError } from "./watch";

/** Asks for the watchlist passcode once per browser; calls onOk with it after the engine accepts it. */
export function PasscodeForm({ onOk, onCancel }: { onOk: (p: string) => void; onCancel?: () => void }) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!v) return;
    setBusy(true);
    setErr(null);
    try {
      await checkPasscode(v);
      savePasscode(v);
      onOk(v);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label className="text-xs text-ink-3" htmlFor="watch-pass">
        Watchlist passcode (asked once on this device)
      </label>
      <div className="flex gap-2">
        <input
          id="watch-pass"
          type="password"
          autoComplete="current-password"
          value={v}
          onChange={(e) => setV(e.target.value)}
          className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-line-strong"
        />
        <button type="submit" disabled={busy || !v} className="h-9 rounded-lg bg-ink px-3 text-sm text-bg disabled:opacity-50">
          {busy ? "Checking…" : "Unlock"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="h-9 rounded-lg px-2 text-sm text-ink-3 hover:text-ink">
            Cancel
          </button>
        )}
      </div>
      {err && <p className="text-xs text-down" role="alert">{err}</p>}
    </form>
  );
}

/** Stock page: add to / remove from the watchlist. */
export function WatchButton({ symbol }: { symbol: string }) {
  const [watched, setWatched] = useState<boolean | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    loadWatchedSymbols()
      .then((r) => setWatched(r.symbols.includes(symbol)))
      .catch(() => setLoadErr(true));
  }, [symbol]);

  const act = async (passcode: string) => {
    setBusy(true);
    setErr(null);
    try {
      if (watched) await removeFromWatchlist(symbol, passcode);
      else await addToWatchlist(symbol, passcode);
      setWatched(!watched);
      setAsk(false);
    } catch (x) {
      if (x instanceof WatchError && x.auth) {
        savePasscode("");
        setAsk(true);
      }
      setErr(x instanceof Error ? x.message : String(x));
    } finally {
      setBusy(false);
    }
  };

  const click = () => {
    const p = savedPasscode();
    if (p) void act(p);
    else setAsk(true);
  };

  if (loadErr) return <p className="text-xs text-down">Watchlist unavailable</p>;
  if (watched === null) return <div className="h-9 w-36 animate-pulse rounded-lg bg-surface-2" aria-hidden="true" />;
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-3">
        <button
          onClick={click}
          disabled={busy}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors disabled:opacity-60 ${
            watched ? "border-up/50 bg-up-soft/40 text-up hover:border-up" : "border-line-strong bg-surface text-ink hover:border-ink"
          }`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : watched ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {watched ? "Remove from watchlist" : "Add to watchlist"}
        </button>
        {watched && (
          <Link href="/watchlist" className="text-xs text-ink-3 underline-offset-2 hover:text-ink hover:underline">
            See how it&apos;s doing
          </Link>
        )}
      </div>
      {ask && <PasscodeForm onOk={(p) => void act(p)} onCancel={() => setAsk(false)} />}
      {err && !ask && <p className="text-xs text-down" role="alert">{err}</p>}
    </div>
  );
}
