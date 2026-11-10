import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Stage Two: the strongest NSE stocks";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "NSE momentum screener", title: "The strongest NSE stocks", subtitle: "Stage analysis, relative strength, bases and the news behind each move." });
}
