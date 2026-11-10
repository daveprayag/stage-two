import type { Metadata } from "next";
import { RunsPage } from "@/components/views/runs";

export const metadata: Metadata = { title: "Runs" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <RunsPage />;
}
