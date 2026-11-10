import type { Metadata } from "next";
import { SectorsPage } from "@/components/views/sectors";

export const metadata: Metadata = { title: "Sectors", description: "Which NSE industries lead by 3-month return, and how many strong stocks each holds." };
export const dynamic = "force-dynamic";

export default function Page() {
  return <SectorsPage />;
}
