import { Suspense } from "react";
import { AiPicksExperiment } from "@/components/AiPicksCard";
import { MarketStrip, MarketStripSkeleton } from "@/components/MarketStrip";
import { Page, PageTitle } from "@/components/Page";
import { ScreenerTable } from "@/components/ScreenerTable";
import { Bone } from "@/components/Skeleton";
import { shortDay } from "@/components/Badges";
import { istNow } from "@/engine/clock";
import { getLive, getScreen } from "@/lib/data";


/** "news 8:30 am" today, else "news 15 Nov"; "news pending" before the first run. */
function newsText(at: string | null): string {
  if (!at) return "news pending";
  const t = Date.parse(at);
  if (istNow(t).date !== istNow().date) return `news ${shortDay(istNow(t).date)}`;
  return `news ${new Date(t).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })}`;
}

/** The data part of the page; the title and controls show at once while it loads. */
async function Screen() {
  const [screen, live] = await Promise.all([getScreen(), getLive()]);
  return (
    <>
      <p className="-mt-4 text-xs text-ink-3" title="The lists are rebuilt from each day's closing prices, usually by 7 pm. Prices in the table and the index box are live.">
        Lists: {shortDay(screen.asOf)} close · {newsText(screen.newsAt)}
      </p>
      {screen.market && <MarketStrip m={screen.market} asOf={screen.asOf} initialLive={live} />}
      <ScreenerTable
        rows={screen.rows}
        news={screen.news}
        asOf={screen.asOf}
        initialLive={live}
        sectorOrder={screen.sectors.map((x) => ({ industry: x.industry, rs: x.rs }))}
      />
      <AiPicksExperiment picks={screen.aiPicks} rows={screen.rows} asOf={screen.asOf} />
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

/** The page; `loading` renders it with placeholders (app/loading.tsx). */
export function Home({ loading = false }: { loading?: boolean }) {
  return (
    <Page>
      <PageTitle title="Momentum screener">
        <p>NSE Momentum leaders: strong stocks in strong sectors, rebuilt every evening after the close.</p>
      </PageTitle>
      {loading ? (
        <ScreenLoading />
      ) : (
        <Suspense fallback={<ScreenLoading />}>
          <Screen />
        </Suspense>
      )}
    </Page>
  );
}
