import type { Metadata } from "next";
import { HoldingsView } from "@/components/HoldingsView";
import { Page, PageTitle } from "@/components/Page";

export const metadata: Metadata = { title: "Holdings", description: "Your demat stocks and ETFs, with live prices and how the screener sees each one.", robots: { index: false } };

export default function HoldingsPage() {
  return (
    <Page>
      <PageTitle title="Holdings">
        <p>Your demat stocks and ETFs from Paytm Money: live prices, and for each one its price trend, its business from the latest results and its buy plan. Private: shown only with your passcode.</p>
      </PageTitle>
      <HoldingsView />
    </Page>
  );
}
