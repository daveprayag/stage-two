import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Stage Two sectors";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Sector strength", title: "Sectors", subtitle: "Which NSE industries lead by 3-month return, and how many strong stocks each holds." });
}
