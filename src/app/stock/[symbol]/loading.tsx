"use client";
import { useParams } from "next/navigation";
import { Page } from "@/components/Page";
import { StockLoading } from "@/components/StockParts";

/** Shown at once on navigation: the stock's page with placeholders until its data arrives. */
export default function Loading() {
  const p = useParams<{ symbol: string }>();
  return (
    <Page>
      <StockLoading symbol={decodeURIComponent(p.symbol ?? "").toUpperCase()} />
    </Page>
  );
}
