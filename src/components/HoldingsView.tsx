"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, LogIn, RefreshCw } from "lucide-react";
import { marketOpen } from "@/engine/clock";
import type { HoldingRow, HoldingsSummary } from "@/engine/holdings";
import { int, istTime, price, titleCase } from "@/lib/format";
import { Change, shortDay } from "./Badges";
import { disconnectPaytm, loadHoldings, startPaytmLogin, type HoldingsData } from "./holdings";
import { Card } from "./Page";
import { PlanLines } from "./PlanLines";
import { Bone } from "./Skeleton";
import { PasscodeForm } from "./WatchButton";
import { savedPasscode, savePasscode, WatchError } from "./watch";

/** ₹ amount, whole rupees. */
const rupees = (x: number | null | undefined) => (x === null || x === undefined || !Number.isFinite(x) ? "—" : `₹${int(Math.round(x))}`);

/** Signed, coloured ₹ amount. */
function Money({ value, className = "" }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined || !Number.isFinite(value)) return <span className={`num text-ink-3 ${className}`}>—</span>;
  const r = Math.round(value);
  return (
    <span className={`num ${r > 0 ? "text-up" : r < 0 ? "text-down" : "text-ink-2"} ${className}`}>
      {r > 0 ? "+" : r < 0 ? "−" : ""}₹{int(Math.abs(r))}
    </span>
  );
}

/** "11:02 am" today, else "15 Nov, 6:10 pm". */
function when(iso: string): string {
  const t = new Date(iso);
  const today = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }) === t.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
  return today ? t.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) : istTime(iso).replace(" IST", "");
}

function Summary({ s, d }: { s: HoldingsSummary; d: HoldingsData }) {
  const n50 = d.indices["NIFTY 50"];
  const n500 = d.indices["NIFTY 500"];
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
      <p className="border-t border-line px-4 py-2.5 text-xs text-ink-3 sm:px-5">
        {s.n} {s.n === 1 ? "holding" : "holdings"} · {s.leaders} {s.leaders === 1 ? "is a Momentum leader" : "are Momentum leaders"} today
      </p>
    </Card>
  );
}

/** How the screener sees it: leader, else stage and RS; plus warnings. */
function ScreenNote({ r }: { r: HoldingRow }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 md:justify-end">
      {r.momentum ? (
        <span className="text-ink">Momentum leader</span>
      ) : r.inScreen ? (
        <span className="text-ink-3">
          Stage {r.stage} · RS {r.rs}
        </span>
      ) : (
        <span className="text-ink-3">{r.etf ? "ETF" : "not screened"}</span>
      )}
      {r.redFlag && <span className="rounded-full border border-down/40 px-1.5 py-px text-[10px] leading-4 text-down">Red flag</span>}
      {r.resultsDrop && <span className="rounded-full border border-down/40 px-1.5 py-px text-[10px] leading-4 text-down">Results ▼</span>}
    </span>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="col-span-2 flex items-baseline justify-between gap-3 text-sm md:col-span-1 md:block">
      <div className="text-xs text-ink-3 md:hidden">{label}</div>
      <div className="md:text-right">{children}</div>
    </div>
  );
}

const COLS = "md:grid-cols-[minmax(0,1.5fr)_repeat(6,minmax(0,1fr))_minmax(0,1.3fr)]";

function Table({ rows }: { rows: HoldingRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className={`hidden gap-x-4 border-b border-line px-5 py-2.5 text-xs text-ink-3 md:grid ${COLS}`}>
        <span>Stock</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Avg cost</span>
        <span className="text-right">Price</span>
        <span className="text-right">Value</span>
        <span className="text-right">Gain</span>
        <span className="text-right">Today</span>
        <span className="text-right">Screener</span>
      </div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.isin} className={`grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-4 md:items-center md:px-5 ${COLS}`}>
            <div className="col-span-2 mb-1 min-w-0 md:col-span-1 md:mb-0">
              <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="text-[15px] font-medium text-ink hover:underline">
                {r.symbol}
              </Link>
              <div className="truncate text-xs text-ink-3">{titleCase(r.name)}</div>
            </div>
            <Fact label="Qty">
              <span className="num">{int(r.qty)}</span>
            </Fact>
            <Fact label="Avg cost">
              <span className="num">{price(r.avg)}</span>
            </Fact>
            <Fact label="Price">
              <span className="num" title={r.priceFrom === "nse" ? "Live NSE price" : r.priceFrom === "paytm" ? "Paytm Money's price at the last sync" : "Last close"}>
                {price(r.price)}
              </span>
            </Fact>
            <Fact label="Value">
              <span className="num">{rupees(r.value)}</span>
              {r.weight !== null && <span className="num ml-1.5 text-xs text-ink-3">{r.weight.toFixed(1)}%</span>}
            </Fact>
            <Fact label="Gain">
              <span className="inline-flex flex-wrap items-baseline gap-x-1.5 md:justify-end">
                <Money value={r.pnl} />
                <Change value={r.pnlPct} className="text-xs" />
              </span>
            </Fact>
            <Fact label="Today">
              <Change value={r.dayPct} digits={2} />
            </Fact>
            <Fact label="Screener">
              <span className="text-xs">
                <ScreenNote r={r} />
              </span>
            </Fact>
            {!r.etf && r.lots.length > 0 && (
              <div className="col-span-2 mt-1 border-t border-dashed border-line pt-2 md:col-span-8 md:mt-0.5">
                <PlanLines lots={r.lots} etf={r.etf} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
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
              <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
                <span>
                  Prices {data.liveAt ? `${data.marketLive ? "live" : "as of"} ${when(data.liveAt)}` : "from the last close"} · lists from the {data.asOf ? shortDay(data.asOf) : "last"} close
                </span>
                <button onClick={() => void load(pass)} disabled={loading} aria-label="Refresh" className="rounded-md p-1.5 hover:bg-surface-2 hover:text-ink disabled:opacity-50">
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
              <Table rows={data.rows} />
            </>
          )}
          {data.fetchedAt && data.rows.length === 0 && <p className="px-1 text-sm text-ink-3">Paytm Money shows no stocks or ETFs in your demat account.</p>}
        </>
      )}
    </div>
  );
}
