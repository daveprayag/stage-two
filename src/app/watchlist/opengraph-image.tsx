import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Stage Two watchlist";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Saved stocks", title: "Watchlist", subtitle: "Stocks worth following, and how each has moved since it was saved." });
}
