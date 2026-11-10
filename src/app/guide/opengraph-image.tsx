import { OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Stage Two guide";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogImage({ eyebrow: "How it works", title: "Guide", subtitle: "Stages, phases, relative strength and the star checks, in plain words." });
}
