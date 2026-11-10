import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Stage Two track record";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "Forward results", title: "Track record", subtitle: "Every evening's lists, followed forward against the NIFTY 500." });
}
