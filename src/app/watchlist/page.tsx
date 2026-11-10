import type { Metadata } from "next";
import { Page, PageTitle } from "@/components/Page";
import { WatchlistView } from "@/components/WatchlistView";

export const metadata: Metadata = { title: "Watchlist" };

export default function WatchlistPage() {
  return (
    <Page>
      <PageTitle title="Watchlist">
        <p>
          Stocks you chose to follow, each measured from the moment you added it, with whether it was starred then. The point: check on stocks you actually
          looked at whether starred ones really rally more than the rest.
        </p>
      </PageTitle>
      <WatchlistView />
    </Page>
  );
}
