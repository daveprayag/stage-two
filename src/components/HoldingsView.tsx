"use client";
import { useCallback, useEffect, useState } from "react";
import { Loader2, LogIn, RefreshCw } from "lucide-react";
import { marketOpen } from "@/engine/clock";
import { SECTOR_LIMIT, type HoldingsSummary } from "@/engine/holdings";
import { int, istTime } from "@/lib/format";
import { Change, shortDay } from "./Badges";
import { disconnectPaytm, loadHoldings, startPaytmLogin, type HoldingsData } from "./holdings";
import { Card } from "./Page";
import { HoldingsList, Money } from "./HoldingsList";
import { Bone } from "./Skeleton";
import { PasscodeForm } from "./WatchButton";
import { savedPasscode, savePasscode, WatchError } from "./watch";

/** ₹ amount, whole rupees. */
const rupees = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : `₹${int(Math.round(x))}`);

/** "11:02 am" today, else "15 Nov, 6:10 pm". */
function when(iso: string): string {
  const t = new Date(iso);
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === t.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  return today ? t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : istTime(iso).replace(" IST", "");
}

function Summary({ s, d }: { s: HoldingsSummary; d: HoldingsData }) {
  const n50 = d.indices["NIFTY 50"];
  const n500 = d.indices["NIFTY 500"];
  const sectors = s.review.sectors.filter((x) => x.sector !== "ETFs").slice(0, 4);
  return (
    <Card>
      <dl className="grid grid-cols-2 gap-px bg-line lg:grid-cols-4">
        <div className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="text-xs text-ink-3">Current value</dt>
          <dd className="num mt-1 text-lg text-ink">{rupees(s.value)}</dd>
        </div>
        <div className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="text-xs text-ink-3">Invested</dt>
          <dd className="num mt-1 text-lg text-ink">{rupees(s.invested)}</dd>
        </div>
        <div className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="text-xs text-ink-3">Total gain</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg">
            <Money value={s.pnl} />
            <Change value={s.pnlPct} className="text-sm" />
          </dd>
        </div>
        <div className="bg-surface px-4 py-3.5 sm:px-5">
          <dt className="text-xs text-ink-3">Today</dt>
          <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 text-lg">
            <Money value={s.dayPnl} />
            <Change value={s.dayPct} digits={2} className="text-sm" />
          </dd>
          {(n50 !== null || n500 !== null) && (
            <dd className="mt-0.5 text-xs text-ink-3">
              NIFTY 50 <Change value={n50} digits={2} /> · 500 <Change value={n500} digits={2} />
            </dd>
          )}
        </div>
      </dl>
      <div className="flex flex-col gap-1 border-t border-line px-4 py-3 text-xs text-ink-3 sm:px-5 lg:flex-row lg:items-baseline lg:justify-between lg:gap-6">
        <span>
          {s.n} {s.n === 1 ? "holding" : "holdings"} · {s.leaders} {s.leaders === 1 ? "is a Momentum leader" : "are Momentum leaders"} today
        </span>
        <span className="flex flex-wrap gap-x-3 gap-y-0.5">
          <span>Biggest sectors</span>
          {sectors.map((x) => (
            <span key={x.sector} className={x.weight > SECTOR_LIMIT ? "text-amber" : "text-ink-2"} title={x.weight > SECTOR_LIMIT ? `Over ${SECTOR_LIMIT}% of the money in one sector` : undefined}>
              {x.sector} <span className="num">{x.weight.toFixed(0)}%</span>
            </span>
          ))}
        </span>
      </div>
    </Card>
  );
}

function Status({ d, busy, onConnect, onDisconnect }: { d: HoldingsData; busy: boolean; onConnect: () => void; onDisconnect: () => void }) {
  if (!d.configured) {
    return (
      <Card className="p-4 text-sm text-ink-2 sm:p-5">
        <p className="text-ink">Paytm Money isn&apos;t set up yet.</p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-3">
          The engine needs the API key and secret of your Paytm Money API app (developer.paytmmoney.com), as the PAYTM_API_KEY and PAYTM_API_SECRET
          secrets on the stage-two-engine Worker in Cloudflare.
        </p>
      </Card>
    );
  }
  const button = (
    <button onClick={onConnect} disabled={busy} className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm text-bg disabled:opacity-50">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
      Log in to Paytm Money
    </button>
  );
  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="text-sm">
        {d.connected ? (
          <>
            <p className="flex items-center gap-1.5 text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-up" aria-hidden="true" />
              Paytm Money connected, read-only
            </p>
            <p className="mt-0.5 text-xs text-ink-3">
              {d.fetchedAt ? `Holdings read ${when(d.fetchedAt)}` : "Reading holdings…"}
              {d.expiresAt ? ` · session until ${when(d.expiresAt)}` : ""}
            </p>
          </>
        ) : d.fetchedAt ? (
          <>
            <p className="text-ink">Holdings as of {when(d.fetchedAt)}</p>
            <p className="mt-0.5 text-xs text-ink-3">Prices stay live. Log in again after you buy or sell, to update the quantities.</p>
          </>
        ) : (
          <>
            <p className="text-ink">Connect your demat holdings</p>
            <p className="mt-0.5 text-xs text-ink-3">Read-only: the engine keeps only Paytm Money&apos;s read-only token, which can&apos;t place orders.</p>
          </>
        )}
        {d.syncError && <p className="mt-1 text-xs text-down">{d.syncError}</p>}
      </div>
      {d.connected ? (
        <button onClick={onDisconnect} disabled={busy} className="h-9 shrink-0 self-start rounded-lg border border-line-strong px-3 text-sm text-ink-2 hover:text-ink disabled:opacity-50 sm:self-auto">
          Disconnect
        </button>
      ) : (
        button
      )}
    </Card>
  );
}

export function HoldingsView() {
  const [pass, setPass] = useState<string | null>(null);
  const [data, setData] = useState<HoldingsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setPass(savedPasscode());
    const q = new URLSearchParams(window.location.search);
    const r = q.get("paytm");
    if (r === "connected") setNote({ ok: true, text: "Paytm Money connected. Holdings are read with a read-only token." });
    else if (r === "error") setNote({ ok: false, text: q.get("why") ?? "The Paytm Money login didn't finish." });
    if (r) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    try {
      setData(await loadHoldings(p));
      setError(null);
    } catch (e) {
      if (e instanceof WatchError && e.auth) {
        savePasscode("");
        setPass("");
      }
      // Never keep showing an older copy: drop it and say why.
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!pass) return;
    void load(pass);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible" && marketOpen()) await load(pass);
        tick();
      }, 60_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [pass, load]);

  const connect = async () => {
    if (!pass) return;
    setBusy(true);
    try {
      const { url } = await startPaytmLogin(pass);
      window.location.href = url;
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
      setBusy(false);
    }
  };
  const disconnect = async () => {
    if (!pass) return;
    setBusy(true);
    try {
      await disconnectPaytm(pass);
      await load(pass);
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  if (pass === null) return <Bone className="h-24 w-full" />;
  if (!pass) {
    return (
      <Card className="p-4 sm:w-[28rem] sm:p-5">
        <p className="mb-3 text-sm text-ink-2">Holdings are private. Enter your passcode (the same one the watchlist uses) to see them on this device.</p>
        <PasscodeForm onOk={(p) => setPass(p)} />
      </Card>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {note && (
        <p role={note.ok ? "status" : "alert"} className={`rounded-xl border bg-surface p-3 text-xs ${note.ok ? "border-up/40 text-ink-2" : "border-down/40 text-down"}`}>
          {note.text}
        </p>
      )}
      {error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-down/40 bg-surface p-5">
          <p className="text-sm text-ink">Couldn&apos;t load your holdings. Nothing is shown rather than an older copy.</p>
          <p className="text-xs text-ink-3">{error}</p>
          <button onClick={() => void load(pass)} className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-ink hover:border-ink">
            Try again
          </button>
        </div>
      ) : !data ? (
        <>
          <span className="sr-only" role="status">Loading your holdings…</span>
          <Bone className="h-20 w-full" />
          <Bone className="h-28 w-full" />
        </>
      ) : (
        <>
          <Status d={data} busy={busy} onConnect={() => void connect()} onDisconnect={() => void disconnect()} />
          {data.summary && data.rows.length > 0 && (
            <>
              <Summary s={data.summary} d={data} />
              <HoldingsList
                rows={data.rows}
                toolbar={
                  <div className="flex items-center gap-1 text-xs text-ink-3">
                    <span>
                      Prices {data.liveAt ? `${data.marketLive ? "live" : "as of"} ${when(data.liveAt)}` : "from the last close"} · lists from the {data.asOf ? shortDay(data.asOf) : "last"} close
                    </span>
                    <button onClick={() => void load(pass)} disabled={loading} aria-label="Refresh" className="rounded-md p-1.5 hover:bg-surface-2 hover:text-ink disabled:opacity-50">
                      <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                }
              />
            </>
          )}
          {data.fetchedAt && data.rows.length === 0 && <p className="px-1 text-sm text-ink-3">Paytm Money shows no stocks or ETFs in your demat account.</p>}
        </>
      )}
    </div>
  );
}
