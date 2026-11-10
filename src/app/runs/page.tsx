import type { Metadata } from "next";
import { RunsPage } from "@/components/views/runs";

export const metadata: Metadata = { title: "Runs", description: "When the engine last checked NSE for prices, filings and news." };
export const dynamic = "force-dynamic";

export default function Page() {
  return <RunsPage />;
}
