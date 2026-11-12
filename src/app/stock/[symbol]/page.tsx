import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Check, X } from "lucide-react";
import { Change, EXTENDED_NOTE, isExtended, RsMeter } from "@/components/Badges";
import { StockGlance, StockHeader, StockLoading } from "@/components/StockParts";
import { AiSummary, Sources } from "@/components/NewsPanel";
import { Card, CardHeader, Page } from "@/components/Page";
import { PriceChart } from "@/components/PriceChart";
import { LivePrice } from "@/components/LivePrice";
import { isStar, marketNote, starChecks } from "@/engine/star";
import { Checklists } from "@/components/Checklists";
import { crore, day, price, titleCase } from "@/lib/format";
import { quarterLabel, type StockResults } from "@/engine/financials";
import { getQuote, getStock } from "@/lib/data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  const s = decodeURIComponent(symbol).toUpperCase();
  return { title: s, description: `${s} on Stage Two: trend stage, relative strength, base, results and the news behind the move.` };
}

function Fact({ label, children, hint, note }: { label: string; children: React.ReactNode; hint?: string; note?: string }) {
  return (
    <div title={hint} className="bg-surface px-4 py-2.5 sm:px-5 sm:py-3">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd className="num mt-1 text-[15px] text-ink">{children}</dd>
      {note && <dd className="mt-0.5 text-[11px] leading-snug text-ink-3">{note}</dd>}
    </div>
  );
}

/** The latest quarter from the company's own NSE filing (revenue and profit against the same quarter a year earlier). */
function LatestResults({ r }: { r: StockResults }) {
  const cr = (x: number) => `₹${x.toLocaleString("en-IN", { maximumFractionDigits: Math.abs(x) >= 100 ? 0 : 1 })} Cr`;
  const item = (label: string, now: number | null, before: number | null, g: number | null) =>
    now === null ? null : (
      <span>
        {label} <span className="num text-ink-2">{cr(now)}</span>
        {g !== null ? (
          <span className={`num ${g >= 0 ? "text-up" : "text-down"}`}> {g >= 0 ? "+" : "−"}{Math.abs(g).toFixed(0)}%</span>
        ) : before !== null ? (
          <span> (from {cr(before)})</span>
        ) : null}
      </span>
    );
  const rev = item(r.now.revenueKind === "interest" ? "Interest earned" : r.now.revenueKind === "income" ? "Total income" : "Revenue", r.now.revenueCr, r.yearAgo?.revenueCr ?? null, r.revenueYoY);
  const pat = item("net profit", r.now.profitCr, r.yearAgo?.profitCr ?? null, r.profitYoY);
  return (
    <p className="text-xs leading-relaxed text-ink-3" title="From the company's results filing on NSE; growth is against the same quarter a year earlier">
      <span className="text-ink-2">Latest results · {quarterLabel(r.qe, r.now.months)}</span> ({r.basis.toLowerCase()}, filed {day(r.filed)}): {rev}
      {rev && pat ? " · " : ""}
      {pat}
      {r.yearAgo ? ` vs the same ${r.now.months === 6 ? "half-year" : "quarter"} a year earlier.` : "."}
    </p>
  );
}

async function StockBody({ symbol }: { symbol: string }) {
  const [data, quote] = await Promise.all([getStock(symbol), getQuote(symbol)]);
  if (!data) notFound();
  const { detail: d, row: rowOrNull, market } = data;
  const row = rowOrNull ?? undefined;
  const last = d.bars[d.bars.length - 1]!;
  const prev = d.bars[d.bars.length - 2];
  const chg = prev ? (last.close / prev.close - 1) * 100 : 0;
  const shortlisted = data.news ?? undefined;
  const filings = shortlisted?.filings.length ? shortlisted.filings : data.filings;
  const headlines = data.headlines ?? shortlisted?.headlines ?? [];
  const passed = d.checklist.filter((c) => c.pass).length;
  const star = row ? starChecks(row, shortlisted) : [];
  const starred = row ? isStar(row, shortlisted) : false;
  const fromHigh = (1 - last.close / d.hi52) * 100;

  return (
    <>
      <div className="flex flex-col gap-4">
        <StockHeader
          symbol={d.symbol}
          stars={starred ? star.filter((c) => c.pass).length : null}
          name={titleCase(d.name)}
          industry={`${d.industry ?? "Industry not classified"}${d.band !== null ? ` · ${d.band}% price band` : ""}`}
          price={<LivePrice symbol={d.symbol} close={last.close} chg={chg} date={last.time} initial={quote} />}
        />
        {row ? (
          <>
            <StockGlance row={row} aiPick={data.aiPick ?? null} />
            {isExtended(row) && (
              <p className="text-xs leading-relaxed text-ink-3">
                <span className="text-ink-2">Extended: up {row.ret3m?.toFixed(0)}% in 3 months.</span> {EXTENDED_NOTE.replace(/^Up 70%\+ in 3 months\. /, "")}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-ink-3">Outside the liquid universe the screener ranks (under ₹2 Cr a day, ₹30 or less, or in a 2% / 5% band).</p>
        )}
        {data.results && <LatestResults r={data.results} />}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4 sm:p-5">
            <PriceChart d={d} initialQuote={quote} />
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Red line: resistance, the nearest price above where the stock turned down before (a close above it is a breakout). Green line: support, the nearest price below where it bounced before. &quot;2 touches&quot; = it turned there twice; more touches, stronger level. Trendlines: sloped lines through rising lows or falling highs, off by default.
            </p>
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              <Fact label="RS rating" hint="Relative Strength rating, 1–99: 3–12 month performance ranked against all liquid NSE stocks" note={row ? `Beat ${row.rs}% of NSE stocks` : undefined}>{row ? <RsMeter rs={row.rs} /> : "—"}</Fact>
              <Fact label="From 52-week high">{fromHigh < 0.05 ? "At high" : `−${fromHigh.toFixed(1)}%`}</Fact>
              <Fact label="1 month"><Change value={row?.ret1m} /></Fact>
              <Fact label="3 months" hint={row && isExtended(row) ? EXTENDED_NOTE : undefined} note={row && isExtended(row) ? "Extended: more 20%+ losers historically" : undefined}><Change value={row?.ret3m} /></Fact>
              <Fact label="10-day range" hint="High–low range of the last 10 sessions as % of price">{row ? `${row.tight10.toFixed(1)}%` : "—"}</Fact>
              <Fact label="Volume 5/50" hint="Below 1 means volume is drying up">{row ? row.dryUp.toFixed(2) : "—"}</Fact>
              <Fact label="Avg daily value" hint="50-day average traded value">{row ? crore(row.turnoverCr) : "—"}</Fact>
              <Fact label="Next resistance">{row?.resistance ? price(row.resistance) : "None nearby"}</Fact>
            </dl>
          </Card>
        </div>

        {row ? (
          <Checklists star={star} starred={starred} market={marketNote(market)} template={d.checklist} />
        ) : (
          <Card>
            <CardHeader title="Trend template" aside={<span className="num text-sm text-ink-2">{passed} of 8</span>} />
            <p className="px-4 pt-1 text-xs leading-relaxed text-ink-3 sm:px-5">This stock is outside the liquid universe the screener ranks.</p>
            <div className="px-4 pb-4 sm:px-5">
              <TemplateList items={d.checklist} />
            </div>
          </Card>
        )}
      </div>

      {shortlisted?.ai ? (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <AiSummary ai={shortlisted.ai} />
          <Sources filings={filings} headlines={headlines} />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-3">
            No AI news summary for this stock today: the nightly job summarises the 60 strongest candidates. Its filings and headlines are below.
          </p>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Sources filings={filings} headlines={headlines} />
          </div>
        </div>
      )}
    </>
  );
}

export default async function StockPage({ params }: Props) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  return (
    <Page>
      <Suspense fallback={<StockLoading symbol={symbol} />}>
        <StockBody symbol={symbol} />
      </Suspense>
    </Page>
  );
}

function CheckIcon({ pass }: { pass: boolean }) {
  return pass ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-label="Pass" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-label="Fail" />;
}

function TemplateList({ items }: { items: { label: string; pass: boolean; value: string }[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((c) => (
        <li key={c.label} className="flex gap-2.5">
          <CheckIcon pass={c.pass} />
          <div className="min-w-0">
            <div className="text-[13px] text-ink-2">{c.label}</div>
            <div className="num text-[11px] text-ink-3">{c.value}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
