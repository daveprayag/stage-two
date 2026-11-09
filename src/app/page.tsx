import { MarketStrip } from "@/components/MarketStrip";
import { Page, PageTitle } from "@/components/Page";
import { ScreenerTable } from "@/components/ScreenerTable";
import { day, istTime } from "@/lib/format";
import { getScreen } from "@/lib/data";

export const revalidate = 900;

export default async function Home() {
  const screen = await getScreen();
  if (!screen) {
    return (
      <Page>
        <p className="py-20 text-center text-ink-2">No screen yet. The first nightly run will create it.</p>
      </Page>
    );
  }
  return (
    <Page>
      <PageTitle title="Momentum screener">
        <p>NSE stocks entering or leading an uptrend, after the close of {day(screen.asOf)}.</p>
        <p className="mt-1 text-xs text-ink-3">
          Prices {istTime(screen.generatedAt)}
          {screen.newsAt ? ` · News ${istTime(screen.newsAt)}` : " · News pending"}
        </p>
      </PageTitle>
      {screen.market && <MarketStrip m={screen.market} asOf={screen.asOf} />}
      <ScreenerTable rows={screen.rows} news={screen.news} asOf={screen.asOf} />
    </Page>
  );
}
