import { Suspense } from "react";
import { MarketStrip, MarketStripSkeleton } from "@/components/MarketStrip";
import { Page, PageTitle } from "@/components/Page";
import { ScreenerTable } from "@/components/ScreenerTable";
import { Bone } from "@/components/Skeleton";
import { day, istTime } from "@/lib/format";
import { getLive, getScreen } from "@/lib/data";

export const dynamic = "force-dynamic";

/** The data part of the page; the title and controls show at once while it loads. */
async function Screen() {
  const [screen, live] = await Promise.all([getScreen(), getLive()]);
  return (
    <>
      <p className="-mt-4 text-xs text-ink-3">
        Lists after the close of {day(screen.asOf)} · prices {istTime(screen.generatedAt)}
        {screen.newsAt ? ` · news ${istTime(screen.newsAt)}` : " · news pending"}
      </p>
      {screen.market && <MarketStrip m={screen.market} asOf={screen.asOf} initialLive={live} />}
      <ScreenerTable
        rows={screen.rows}
        news={screen.news}
        asOf={screen.asOf}
        initialLive={live}
        sectorOrder={screen.sectors.map((x) => ({ industry: x.industry, rs: x.rs }))}
      />
    </>
  );
}

function ScreenLoading() {
  return (
    <>
      <Bone className="-mt-4 h-3 w-72 max-w-full" />
      <MarketStripSkeleton />
      <ScreenerTable rows={null} />
    </>
  );
}

export default function Home() {
  return (
    <Page>
      <PageTitle title="Momentum screener">
        <p>NSE stocks entering or leading an uptrend, rebuilt every evening after the close.</p>
      </PageTitle>
      <Suspense fallback={<ScreenLoading />}>
        <Screen />
      </Suspense>
    </Page>
  );
}
