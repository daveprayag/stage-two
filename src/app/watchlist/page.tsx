import type { Metadata } from "next";
import { Page, PageTitle } from "@/components/Page";
import { WatchlistView } from "@/components/WatchlistView";

export const metadata: Metadata = { title: "Watchlist", description: "Stocks worth following, and how each has moved since it was saved." };

export default function WatchlistPage() {
  return (
    <Page>
      <PageTitle title="Watchlist">
        <p>
          Stocks you chose to follow, each measured from the moment you added it, with whether it was a Momentum leader then. On stocks you actually
          looked at: do the leaders do better than the rest?
        </p>
      </PageTitle>
      <WatchlistView />
    </Page>
  );
}
