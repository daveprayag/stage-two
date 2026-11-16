import type { Metadata } from "next";
import { Page, PageTitle } from "@/components/Page";
import { WatchlistView } from "@/components/WatchlistView";

export const metadata: Metadata = { title: "Watchlist", description: "Stocks worth following, and how each has moved since it was saved." };

export default function WatchlistPage() {
  return (
    <Page>
      <PageTitle
        title="Watchlist"
        help={
          <>
            <p>
              Stocks you chose to follow, each measured from the moment you added it, with whether it was a Momentum leader then. On stocks you actually looked at: do
              the leaders do better than the rest?
            </p>
            <p>
              Each stock is measured from the price when you added it. &quot;Rose 10%+&quot; and &quot;Fell 8%+&quot; count the best and worst point since then, from daily
              highs and lows.
            </p>
            <p>A handful of stocks over a few days says little; the comparison means something after 20+ stocks and several weeks.</p>
          </>
        }
      >
        <p>Stocks you follow, each measured from the day you added it.</p>
      </PageTitle>
      <WatchlistView />
    </Page>
  );
}
