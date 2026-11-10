import type { Metadata } from "next";
import { TrackPage } from "@/components/views/track";

export const metadata: Metadata = { title: "Track record", description: "Every evening's lists, followed forward against the NIFTY 500." };
export const dynamic = "force-dynamic";

export default function Page() {
  return <TrackPage />;
}
