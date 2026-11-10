"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { marketOpen } from "@/engine/clock";
import type { WatchRow, WatchSummary } from "@/engine/watchlist";
import { day, istTime, price, titleCase } from "@/lib/format";
import { Change, StarMark } from "./Badges";
import { Bone } from "./Skeleton";
import { PasscodeForm } from "./WatchButton";
import { addToWatchlist, loadWatchlist, removeFromWatchlist, savedPasscode, savePasscode, WatchError, type WatchData } from "./watch";

const pctOf = (x: number | null) => (x === null ? "—" : `${Math.round(x)}%`);

function SummaryCard({ s }: { s: WatchSummary }) {
  const empty = s.n === 0;
  return (
    <div className={`rounded-2xl border bg-surface p-4 ${s.key === "starred" ? "border-amber/50" : "border-line"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
          {s.key === "starred" && <StarMark count={5} />}
          {s.label}
        </span>
        <span className="num text-xs text-ink-3">{s.n} {s.n === 1 ? "stock" : "stocks"}</span>
      </div>
      {empty ? (
        <p className="mt-3 text-xs text-ink-3">None yet.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-xs">
          <div>
            <dt className="text-ink-3">Avg return</dt>
            <dd className="mt-0.5 text-sm"><Change value={s.avgRet} /></dd>
          </div>
          <div>
            <dt className="text-ink-3">vs NIFTY 500</dt>
            <dd className="mt-0.5 text-sm"><Change value={s.avgVsNifty} /></dd>
          </div>
          <div>
            <dt className="text-ink-3">Up now</dt>
            <dd className="num mt-0.5 text-sm text-ink">{pctOf(s.pctUp)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Rose 10%+</dt>
            <dd className="num mt-0.5 text-sm text-ink">{pctOf(s.pctHit10)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Fell 8%+</dt>
            <dd className="num mt-0.5 text-sm text-ink">{pctOf(s.pctDown8)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">Avg best</dt>
            <dd className="mt-0.5 text-sm"><Change value={s.avgBest} /></dd>
          </div>
        </dl>
      )}
    </div>
  );
}

function StarThen({ r }: { r: WatchRow }) {
  if (r.starred) return <span className="inline-flex items-center gap-1 text-amber"><StarMark count={r.starCount ?? 5} /> starred</span>;
  return <span className="text-ink-3">{r.momentum ? `momentum leader, ${r.starCount ?? 0}/6 checks` : "not starred"}</span>;
}

function StarNow({ r }: { r: WatchRow }) {
  if (r.starredNow) return <span className="inline-flex items-center gap-1 text-amber"><StarMark count={r.starCountNow ?? 5} /> starred</span>;
  return <span className="text-ink-3">{r.starCountNow !== null ? `${r.starCountNow}/6 checks` : "not a momentum leader"}</span>;
}

export function WatchlistView() {
  const [data, setData] = useState<WatchData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [actErr, setActErr] = useState<string | null>(null);
  const [ask, setAsk] = useState<null | { kind: "add" | "remove"; symbol: string }>(null);

  const load = useCallback(async () => {
    try {
      const d = await loadWatchlist();
      setData(d);
      setError(null);
    } catch (e) {
      // Never keep showing an older copy: drop it and say why.
      setData(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(async () => {
        if (document.visibilityState === "visible" && marketOpen()) await load();
        tick();
      }, 60_000);
    };
    tick();
    return () => clearTimeout(timer);
  }, [load]);

  const run = async (kind: "add" | "remove", sym: string, passcode: string) => {
    setBusy(sym);
    setActErr(null);
    try {
      if (kind === "add") await addToWatchlist(sym, passcode);
      else await removeFromWatchlist(sym, passcode);
      setAsk(null);
      if (kind === "add") setSymbol("");
      await load();
    } catch (e) {
      if (e instanceof WatchError && e.auth) {
        savePasscode("");
        setAsk({ kind, symbol: sym });
      }
      setActErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const start = (kind: "add" | "remove", sym: string) => {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    const p = savedPasscode();
    if (p) void run(kind, s, p);
    else setAsk({ kind, symbol: s });
  };

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-down/40 bg-surface p-5">
        <p className="text-sm text-ink">Couldn&apos;t load the latest watchlist data. Nothing is shown rather than an older copy.</p>
        <p className="text-xs text-ink-3">{error}</p>
        <button onClick={() => void load()} className="rounded-lg border border-line-strong px-3 py-1.5 text-sm text-ink hover:border-ink">
          Try again
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <span className="sr-only" role="status">Loading the latest data…</span>
        <Bone className="h-10 w-full rounded-lg sm:w-96" />
        <div className="grid gap-3 md:grid-cols-3">
          <Bone className="h-36 rounded-2xl" />
          <Bone className="h-36 rounded-2xl" />
          <Bone className="h-36 rounded-2xl" />
        </div>
        <Bone className="h-64 rounded-2xl" />
      </div>
    );
  }

  const pricesDown = marketOpen() && !data.liveFresh;
  const rows = data.items;
  return (
    <div className="flex flex-col gap-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start("add", symbol);
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex gap-2 sm:w-96">
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="NSE symbol, e.g. LAURUSLABS"
            aria-label="Symbol to add"
            className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink uppercase outline-none placeholder:normal-case placeholder:text-ink-3 focus:border-line-strong md:h-9"
          />
          <button type="submit" disabled={!symbol || busy !== null} className="inline-flex h-10 items-center gap-1 rounded-lg bg-ink px-3 text-sm text-bg disabled:opacity-50 md:h-9">
            {busy === symbol.trim().toUpperCase() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add
          </button>
        </div>
        <p className="text-xs text-ink-3">Or use &quot;Add to watchlist&quot; on any stock&apos;s page.</p>
      </form>
      {ask && (
        <div className="sm:w-[28rem]">
          <PasscodeForm onOk={(p) => void run(ask.kind, ask.symbol, p)} onCancel={() => setAsk(null)} />
        </div>
      )}
      {actErr && !ask && <p className="text-xs text-down" role="alert">{actErr}</p>}
      {!data.canEdit && (
        <p className="rounded-xl border border-amber/40 bg-surface p-3 text-xs text-ink-2">
          The watchlist passcode isn&apos;t set up yet, so stocks can&apos;t be added. It is the WATCHLIST_KEY secret on the stage-two-engine Worker in Cloudflare.
        </p>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {data.summary.map((s) => (
          <SummaryCard key={s.key} s={s} />
        ))}
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-ink-3">
        Each stock is measured from the price when you added it. &quot;Rose 10%+&quot; and &quot;Fell 8%+&quot; count the best and worst point since then, from
        daily highs and lows. A handful of stocks over a few days says little; the comparison means something after 20+ stocks and several weeks.
      </p>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-xs text-ink-3 md:px-5">
          <span>
            <span className="num text-ink-2">{rows.length}</span> watched · lists as of {day(data.asOf)}
            {data.liveAt && <span className="ml-2">· prices {data.marketLive ? "live" : "as of"} {istTime(data.liveAt)}</span>}
          </span>
          {pricesDown && (
            <span role="alert" className="inline-flex items-center gap-1.5 text-down">
              <span className="h-1.5 w-1.5 rounded-full bg-down" aria-hidden="true" />
              live prices unavailable, retrying
            </span>
          )}
        </div>
        {!rows.length ? (
          <p className="px-5 py-12 text-center text-sm text-ink-3">Nothing on your watchlist yet. Add a stock above or from its page.</p>
        ) : (
          <>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_auto] gap-x-4 border-b border-line px-5 py-2.5 text-xs text-ink-3 md:grid">
            <span>Stock</span>
            <span className="text-right">Then → now</span>
            <span className="text-right">Return</span>
            <span className="text-right">Best / worst</span>
            <span className="text-right">vs NIFTY 500</span>
            <span className="text-right">Star now</span>
            <span className="w-7" />
          </div>
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const hide = pricesDown;
              return (
                <li key={r.symbol} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 px-4 py-4 md:grid-cols-[minmax(0,1.4fr)_repeat(5,minmax(0,1fr))_auto] md:items-center md:px-5">
                  <div className="min-w-0">
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="text-[15px] font-medium text-ink hover:underline">
                      {r.symbol}
                    </Link>
                    <div className="truncate text-xs text-ink-3">{titleCase(r.name)}</div>
                    <div className="mt-1 text-xs">
                      Added {day(r.addedAt.slice(0, 10))} · <StarThen r={r} />
                    </div>
                  </div>
                  <div className="text-right md:order-last">
                    <button
                      onClick={() => start("remove", r.symbol)}
                      disabled={busy !== null}
                      aria-label={`Remove ${r.symbol}`}
                      className="rounded-md p-1.5 text-ink-3 hover:bg-surface-2 hover:text-ink disabled:opacity-50"
                    >
                      {busy === r.symbol ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    </button>
                  </div>
                  <Fact label="Then → now">
                    <span className="num">{price(r.price)}</span>
                    <span className="text-ink-3"> → </span>
                    <span className="num">{hide ? "—" : price(r.now)}</span>
                  </Fact>
                  <Fact label="Return">{hide ? <Change value={null} /> : <Change value={r.ret} />}</Fact>
                  <Fact label="Best / worst">
                    <Change value={r.best} /> <span className="text-ink-3">/</span> <Change value={r.worst} />
                  </Fact>
                  <Fact label="vs NIFTY 500">{hide ? <Change value={null} /> : <Change value={r.vsNifty} />}</Fact>
                  <Fact label="Star now">
                    <span className="text-xs"><StarNow r={r} /></span>
                  </Fact>
                </li>
              );
            })}
          </ul>
          </>
        )}
      </div>
    </div>
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
