import { HoldingsSkeleton } from "@/components/HoldingsView";
import { Page, PageTitle } from "@/components/Page";

/** Shown at once on navigation: the holdings page's shape, not the screener's. */
export default function Loading() {
  return (
    <Page>
      <PageTitle title="Holdings">
        <p>Your Paytm Money demat holdings. Private: shown only with your passcode.</p>
      </PageTitle>
      <HoldingsSkeleton />
    </Page>
  );
}
