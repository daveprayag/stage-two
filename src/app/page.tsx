import { MarketStrip } from "@/components/MarketStrip";
import { Page, PageTitle } from "@/components/Page";
import { ScreenerTable } from "@/components/ScreenerTable";
import { day, istTime } from "@/lib/format";
import { getLive, getScreen } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [screen, live] = await Promise.all([getScreen(), getLive()]);
  return (
    <Page>
      <PageTitle title="Momentum screener">
        <p>NSE stocks entering or leading an uptrend, after the close of {day(screen.asOf)}.</p>
        <p className="mt-1 text-xs text-ink-3">
          Prices {istTime(screen.generatedAt)}
          {screen.newsAt ? ` · News ${istTime(screen.newsAt)}` : " · News pending"}
        </p>
      </PageTitle>
      {screen.market && <MarketStrip m={screen.market} asOf={screen.asOf} initialLive={live} />}
      <ScreenerTable rows={screen.rows} news={screen.news} asOf={screen.asOf} initialLive={live} sectorOrder={screen.sectors.map((x) => ({ industry: x.industry, rs: x.rs }))} />
    </Page>
  );
}
