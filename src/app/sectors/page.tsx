import type { Metadata } from "next";
import { SectorsPage } from "@/components/views/sectors";

export const metadata: Metadata = { title: "Sectors" };
export const dynamic = "force-dynamic";

export default function Page() {
  return <SectorsPage />;
}
