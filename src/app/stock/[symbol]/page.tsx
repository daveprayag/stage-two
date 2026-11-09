import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronLeft, X } from "lucide-react";
import { Change, PhaseLabel, phaseDetail, RsMeter, StageLabel, StarMark, TAG_LABEL } from "@/components/Badges";
import { AiSummary, Sources } from "@/components/NewsPanel";
import { Card, CardHeader, Page } from "@/components/Page";
import { PriceChart } from "@/components/PriceChart";
import { LivePrice } from "@/components/LivePrice";
import { isTopSetup, topSetupChecks } from "@/engine/topsetup";
import { isStar, marketNote, starChecks } from "@/engine/star";
import { Checklists } from "@/components/Checklists";
import { crore, day, price, titleCase } from "@/lib/format";
import { getStock } from "@/lib/data";

export const revalidate = 3600;

/** Rendered on first visit, then cached for an hour (and refreshed after each nightly run). */
export async function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ symbol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { symbol } = await params;
  return { title: decodeURIComponent(symbol).toUpperCase() };
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

export default async function StockPage({ params }: Props) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const data = await getStock(symbol);
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
  const top = row ? isTopSetup(row, shortlisted) : false;
  const topChecks = row ? topSetupChecks(row, shortlisted) : [];
  const star = row ? starChecks(row, shortlisted) : [];
  const starred = row ? isStar(row, shortlisted) : false;
  const screens = [...(starred ? ["Starred"] : []), ...(top ? ["Top setup"] : []), ...(row?.tags ?? []).filter((t) => t !== "ankur" && t !== "qualified").map((t) => TAG_LABEL[t])];
  const fromHigh = (1 - last.close / d.hi52) * 100;

  return (
    <Page>
      <div className="flex flex-col gap-4">
        <Link href="/" className="-ml-1 inline-flex w-fit items-center gap-0.5 text-sm text-ink-2 hover:text-ink">
          <ChevronLeft className="h-4 w-4" /> Screener
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 font-display text-[2.75rem] leading-none tracking-tight sm:text-6xl">
              {d.symbol}
              {starred && <StarMark count={star.filter((c) => c.pass).length} className="h-7 w-7 sm:h-8 sm:w-8" />}
            </h1>
            <p className="mt-2 text-sm text-ink-2">{titleCase(d.name)}</p>
            <p className="mt-0.5 text-xs text-ink-3">
              {d.industry ?? "Industry not classified"}
              {d.band !== null ? ` · ${d.band}% price band` : ""}
            </p>
          </div>
          <LivePrice symbol={d.symbol} close={last.close} chg={chg} date={last.time} />
        </div>
        {row && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
            <StageLabel stage={row.stage} age={row.stageAge} />
            {row.phase && (
              <>
                <span className="text-ink-3">·</span>
                <span>
                  <PhaseLabel phase={row.phase} stage={row.stage} /> in the uptrend ({phaseDetail(row).toLowerCase()}
                  {row.baseDate && !row.inBase ? `, left its base after ${day(row.baseDate)}` : ""})
                </span>
              </>
            )}
            {screens.length > 0 && (
              <>
                <span className="text-ink-3">·</span>
                <span>{screens.join(", ")}</span>
              </>
            )}
            {(row.scans.length > 0 || row.setup) && (
              <>
                <span className="text-ink-3">·</span>
                <span>Ankur&apos;s scans: {[...row.scans, ...(row.setup ? [`${row.setup} setup`] : [])].join(", ")}</span>
              </>
            )}
          </p>
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="p-4 sm:p-5">
            <PriceChart d={d} />
            <p className="mt-4 text-xs leading-relaxed text-ink-3">
              Red line: resistance, the nearest price above where the stock turned down before (a close above it is a breakout). Green line: support, the nearest price below where it bounced before. &quot;2 touches&quot; = it turned there twice; more touches, stronger level. Trendlines: sloped lines through rising lows or falling highs, off by default.
            </p>
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
              <Fact label="RS rating" hint="Relative Strength rating, 1–99: 3–12 month performance ranked against all liquid NSE stocks" note={row ? `Beat ${row.rs}% of NSE stocks` : undefined}>{row ? <RsMeter rs={row.rs} /> : "—"}</Fact>
              <Fact label="From 52-week high">{fromHigh < 0.05 ? "At high" : `−${fromHigh.toFixed(1)}%`}</Fact>
              <Fact label="1 month"><Change value={row?.ret1m} /></Fact>
              <Fact label="3 months"><Change value={row?.ret3m} /></Fact>
              <Fact label="10-day range" hint="High–low range of the last 10 sessions as % of price">{row ? `${row.tight10.toFixed(1)}%` : "—"}</Fact>
              <Fact label="Volume 5/50" hint="Below 1 means volume is drying up">{row ? row.dryUp.toFixed(2) : "—"}</Fact>
              <Fact label="Avg daily value" hint="50-day average traded value">{row ? crore(row.turnoverCr) : "—"}</Fact>
              <Fact label="Next resistance">{row?.resistance ? price(row.resistance) : "None nearby"}</Fact>
            </dl>
          </Card>
        </div>

        {row ? (
          <Checklists star={star} starred={starred} market={marketNote(market)} top={topChecks} topSetup={top} template={d.checklist} />
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
