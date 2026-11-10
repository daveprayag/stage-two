import type { Metadata } from "next";
import { TrackPage } from "@/components/views/track";

export const metadata: Metadata = { title: "Track record" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <TrackPage />;
}
