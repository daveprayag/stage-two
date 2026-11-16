"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, LogIn, RefreshCw } from "lucide-react";
import { marketOpen } from "@/engine/clock";
import type { HoldingsSummary } from "@/engine/holdings";
import type { HoldingsHistory } from "@/engine/portfolio";
import { int, istTime } from "@/lib/format";
import { Change, shortDay } from "./Badges";
import { disconnectPaytm, loadHoldings, loadHoldingsHistory, startPaytmLogin, type HoldingsData } from "./holdings";
import { Card } from "./Page";
import { HoldingsList, Money } from "./HoldingsList";
import { ChartCard } from "./charts/base";
import { AllocationMap } from "./charts/AllocationMap";
import { GainBars, SectorBars, TrendMatrix } from "./charts/Breakdown";
import { PerformanceChart } from "./charts/PerformanceChart";
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

function Hero({ s, d, history, histError }: { s: HoldingsSummary; d: HoldingsData; history: HoldingsHistory | null; histError: string | null }) {
  const n500 = d.indices["NIFTY 500"];
  const qty = useMemo(() => Object.fromEntries(d.rows.map((r) => [r.symbol, r.qty])), [d.rows]);
  // A live point at the end of the line, when today's prices are newer than the last close.
  const live = useMemo(() => {
    if (!history || !d.liveAt || istDay(d.liveAt) <= history.asOf) return null;
    const lastNifty = [...history.nifty500].reverse().find((x) => x !== null) ?? null;
    return {
      closes: Object.fromEntries(d.rows.map((r) => [r.symbol, r.priceFrom === "nse" ? r.price : null])),
      nifty: lastNifty !== null && n500 !== null ? lastNifty * (1 + n500 / 100) : null,
    };
  }, [history, d.liveAt, d.rows, n500]);
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="grid grid-cols-1 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="flex flex-col gap-6 border-b border-line p-5 sm:p-6 lg:border-r lg:border-b-0">
          <div>
            <div className="text-xs text-ink-3">Portfolio value</div>
            <div className="mt-1.5 text-[2.75rem] leading-none font-medium tracking-tight text-ink sm:text-5xl">{rupees(s.value)}</div>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-2 text-sm">
              <Money value={s.pnl} />
              <Change value={s.pnlPct} />
              <span className="text-xs text-ink-3">since you bought</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-xs text-ink-3">Today</dt>
              <dd className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                <Money value={s.dayPnl} />
                <Change value={s.dayPct} digits={2} className="text-xs" />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">NIFTY 500 today</dt>
              <dd className="mt-0.5">
                <Change value={n500} digits={2} />
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Invested</dt>
              <dd className="num mt-0.5 text-ink">{rupees(s.invested)}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-3">Holdings</dt>
              <dd className="mt-0.5 text-ink">
                {s.n} <span className="text-xs text-ink-3">· {s.leaders} Momentum {s.leaders === 1 ? "leader" : "leaders"}</span>
              </dd>
            </div>
          </dl>
        </div>
        <div className="min-w-0 p-5 sm:p-6">
          <h2 className="mb-3 text-sm font-medium text-ink">Today&apos;s holdings against NIFTY 500</h2>
          {history ? (
            <PerformanceChart history={history} qty={qty} live={live} />
          ) : histError ? (
            <p className="py-16 text-center text-xs text-ink-3">Price history isn&apos;t available right now ({histError}).</p>
          ) : (
            <Bone className="h-[17rem] w-full" />
          )}
          <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
            Today&apos;s holdings at today&apos;s quantities, priced back over the range. It is not your actual past return: your buys and sells are not in it.
          </p>
        </div>
      </div>
    </section>
  );
}

const istDay = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10);

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
  const [history, setHistory] = useState<HoldingsHistory | null>(null);
  const [histError, setHistError] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ isin: string; n: number } | null>(null);
  const pick = useCallback((isin: string) => setFocus((f) => ({ isin, n: (f?.n ?? 0) + 1 })), []);

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

  // Price history for the charts: once per session's close and set of holdings (the engine caches it too).
  const histKey = data?.asOf && data.rows.length ? `${data.asOf}|${data.rows.map((r) => r.symbol).sort().join(",")}` : null;
  useEffect(() => {
    if (!pass || !histKey) return;
    let gone = false;
    loadHoldingsHistory(pass)
      .then((h) => {
        if (!gone) {
          setHistory(h);
          setHistError(null);
        }
      })
      .catch((e) => {
        if (!gone) setHistError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      gone = true;
    };
  }, [pass, histKey]);

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
              <Hero s={data.summary} d={data} history={history} histError={histError} />
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <ChartCard className="lg:col-span-2" title="Where your money is" sub="Each tile is a holding, sized by its value and grouped by sector. Tap one to open it in the list.">
                  <AllocationMap rows={data.rows} onPick={pick} />
                </ChartCard>
                <ChartCard title="Concentration" sub="How much sits in each sector, against a 25% limit for any one sector.">
                  <SectorBars rows={data.rows} />
                </ChartCard>
                <ChartCard
                  className="lg:col-span-2"
                  title="Price trend and business"
                  sub="Each stock by its price trend (rows) and its latest quarter against a year earlier (columns). Dot size is its share of the money."
                  foot="Price rows are tested: weak or deep stocks trailed the average stock over the next 6 months in 2012–24 and 2025–26. Business columns are not tested, so read them as context. ETFs are left out."
                >
                  <TrendMatrix rows={data.rows} onPick={pick} />
                </ChartCard>
                <ChartCard title="Gain and loss" sub="Each holding since you bought it. Tap one to open it in the list.">
                  <GainBars rows={data.rows} onPick={pick} />
                </ChartCard>
              </div>
              <h2 className="mt-4 px-1 text-base font-medium text-ink">All holdings</h2>
              <HoldingsList
                history={history}
                focus={focus}
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
