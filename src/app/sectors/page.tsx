import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Change, RsMeter } from "@/components/Badges";
import { Card, Page, PageTitle } from "@/components/Page";
import { Bone } from "@/components/Skeleton";
import { getScreen } from "@/lib/data";
import type { SectorRow } from "@/engine/types";

export const metadata: Metadata = { title: "Sectors" };
export const dynamic = "force-dynamic";

function Leaders({ s }: { s: SectorRow }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {s.leaders.map((sym) => (
        <Link key={sym} href={`/stock/${encodeURIComponent(sym)}`} className="text-sm text-ink-2 underline decoration-line-strong underline-offset-4 hover:text-ink hover:decoration-ink-3">
          {sym}
        </Link>
      ))}
    </span>
  );
}

function Stage2({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="num w-8 text-right text-ink">{(v * 100).toFixed(0)}%</span>
      <span className="h-1 w-12 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full bg-up" style={{ width: `${v * 100}%` }} />
      </span>
    </span>
  );
}

const th = "px-3 py-3 text-xs font-normal text-ink-3 first:pl-5 last:pr-5";
const td = "px-3 py-3.5 first:pl-5 last:pr-5";

/** The ranking; sectors null = still loading (same layout, placeholder values). */
function SectorsCard({ sectors }: { sectors: SectorRow[] | null }) {
  return (
      <Card>
        <ol className="divide-y divide-line md:hidden">
          {sectors === null ? <MobileBones /> : sectors.map((s, k) => (
            <li key={s.industry} className="px-4 py-4">
              <div className="flex items-baseline gap-3">
                <span className="num w-5 shrink-0 text-xs text-ink-3">{k + 1}</span>
                <span className="min-w-0 flex-1 text-[15px] font-medium text-ink">
                  {s.industry}
                  {s.rank >= 0.6 && <span className="ml-2 text-xs font-normal text-up">Strong</span>}
                </span>
                <span className="num shrink-0 text-xs text-ink-3">{s.stocks} stocks</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 pl-8 text-xs">
                <div>
                  <dt className="text-ink-3">Median RS</dt>
                  <dd className="num mt-0.5 text-sm text-ink">{s.rs}</dd>
                </div>
                <div>
                  <dt className="text-ink-3">In stage 2</dt>
                  <dd className="num mt-0.5 text-sm text-ink">{(s.stage2 * 100).toFixed(0)}%</dd>
                </div>
                <div>
                  <dt className="text-ink-3">3 months</dt>
                  <dd className="mt-0.5 text-sm">
                    <Change value={s.ret3m} />
                  </dd>
                </div>
              </dl>
              <div className="mt-3 pl-8">
                <Leaders s={s} />
              </div>
            </li>
          ))}
        </ol>
        <table className="hidden w-full text-sm md:table">
          <thead className="border-b border-line text-left">
            <tr>
              <th className={th}>#</th>
              <th className={th}>Sector</th>
              <th className={th}>Median RS</th>
              <th className={th}>In stage 2</th>
              <th className={`${th} text-right`}>Median 1M</th>
              <th className={`${th} text-right`}>Median 3M</th>
              <th className={th}>Strongest stocks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {sectors === null ? <RowBones /> : sectors.map((s, k) => (
              <tr key={s.industry}>
                <td className={`${td} num text-ink-3`}>{k + 1}</td>
                <td className={td}>
                  <div className="text-ink">
                    {s.industry}
                    {s.rank >= 0.6 && <span className="ml-2 text-xs text-up">Strong</span>}
                  </div>
                  <div className="mt-0.5 text-xs text-ink-3">{s.stocks} stocks</div>
                </td>
                <td className={td}>
                  <RsMeter rs={s.rs} />
                </td>
                <td className={td}>
                  <Stage2 v={s.stage2} />
                </td>
                <td className={`${td} text-right`}>
                  <Change value={s.ret1m} />
                </td>
                <td className={`${td} text-right`}>
                  <Change value={s.ret3m} />
                </td>
                <td className={td}>
                  <Leaders s={s} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
  );
}

function MobileBones() {
  return Array.from({ length: 8 }, (_, i) => (
    <li key={i} className="px-4 py-4" aria-hidden="true">
      <div className="flex items-baseline gap-3">
        <Bone className="h-3 w-4" />
        <Bone className="h-4 flex-1" />
        <Bone className="h-3 w-14" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 pl-7">
        <Bone className="h-8" />
        <Bone className="h-8" />
        <Bone className="h-8" />
      </div>
    </li>
  ));
}

function RowBones() {
  return Array.from({ length: 10 }, (_, i) => (
    <tr key={i} aria-hidden="true">
      <td className={td}><Bone className="h-3 w-4" /></td>
      <td className={td}><Bone className="h-4 w-40" /></td>
      <td className={td}><Bone className="h-4 w-20" /></td>
      <td className={td}><Bone className="h-4 w-16" /></td>
      <td className={td}><Bone className="ml-auto h-4 w-12" /></td>
      <td className={td}><Bone className="ml-auto h-4 w-12" /></td>
      <td className={td}><Bone className="h-4 w-48" /></td>
    </tr>
  ));
}

async function SectorsData() {
  const screen = await getScreen();
  return <SectorsCard sectors={screen.sectors} />;
}

export default function SectorsPage() {
  return (
    <Page>
      <PageTitle title="Sector strength">
        Leaders tend to come in groups. Sectors are ranked by the median RS rating of their liquid stocks, with the share already in a stage 2 uptrend. &quot;Strong&quot;
        marks the top 40% of industries by 3-month return, the ones that count for Momentum leaders. Groups follow NSE&apos;s industry classification.
      </PageTitle>
      <Suspense fallback={<SectorsCard sectors={null} />}>
        <SectorsData />
      </Suspense>
    </Page>
  );
}
