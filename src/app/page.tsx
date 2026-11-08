import { MarketStrip } from "@/components/MarketStrip";
import { ScreenerTable } from "@/components/ScreenerTable";
import { day, istTime } from "@/lib/format";
import { getScreen } from "@/lib/data";

export const revalidate = 900;

export default async function Home() {
  const screen = await getScreen();
  if (!screen) {
    return <div className="mx-auto max-w-7xl px-4 py-20 text-center text-ink-2 sm:px-6">No screen yet. The first nightly run will create it.</div>;
  }
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">Momentum screener</h1>
          <p className="mt-1 text-sm text-ink-2">
            NSE stocks entering or leading an uptrend, after the close of {day(screen.asOf)}. Click a stock for its chart, levels and news.
          </p>
        </div>
        <p className="text-xs text-ink-3">
          Prices {istTime(screen.generatedAt)}
          {screen.newsAt ? ` · news ${istTime(screen.newsAt)}` : " · news pending"}
        </p>
      </div>
      {screen.market && <MarketStrip m={screen.market} />}
      <ScreenerTable rows={screen.rows} news={screen.news} />
    </div>
  );
}
