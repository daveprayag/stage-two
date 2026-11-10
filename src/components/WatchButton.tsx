"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
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

/** Stock page: save to / remove from the watchlist. A bookmark icon (with a label on wider screens). */
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

  const label = watched ? "Saved" : "Save";
  return (
    <div className="relative">
      <button
        onClick={click}
        disabled={busy || watched === null || loadErr}
        aria-pressed={!!watched}
        aria-label={watched ? `Remove ${symbol} from your watchlist` : `Save ${symbol} to your watchlist`}
        title={loadErr ? "Watchlist unavailable" : watched ? "On your watchlist: tap to remove" : "Save to your watchlist"}
        className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-full border px-2.5 text-sm transition-colors disabled:opacity-60 sm:px-3.5 ${
          watched ? "border-up/50 bg-up-soft/40 text-up hover:border-up" : "border-line-strong bg-surface text-ink hover:border-ink"
        }`}
      >
        {busy || watched === null ? (
          <Loader2 className="h-[18px] w-[18px] animate-spin" aria-hidden="true" />
        ) : watched ? (
          <BookmarkCheck className="h-[18px] w-[18px]" fill="currentColor" fillOpacity={0.15} aria-hidden="true" />
        ) : (
          <Bookmark className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
        <span className="hidden sm:inline">{label}</span>
      </button>
      {(ask || err) && (
        <div className="absolute top-full right-0 z-20 mt-2 w-72 rounded-xl border border-line bg-surface p-3 shadow-lg">
          {ask ? <PasscodeForm onOk={(p) => void act(p)} onCancel={() => setAsk(false)} /> : <p className="text-xs text-down" role="alert">{err}</p>}
          {watched && !ask && (
            <Link href="/watchlist" className="mt-2 block text-xs text-ink-3 hover:text-ink">
              Open the watchlist
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
