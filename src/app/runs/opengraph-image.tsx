import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Stage Two data runs";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Data status", title: "Runs", subtitle: "When the engine last checked NSE for prices, filings and news." });
}
