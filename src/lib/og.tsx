/**
 * Social preview cards (Open Graph / X): one quiet layout for every page. Warm paper background, the site's serif for
 * the title, and a single line: the logo's base-then-breakout motif, or a stock's own year of closes.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

const C = { bg: "#f5f3ee", ink: "#17181b", ink2: "#4a4c52", ink3: "#74767c", line: "#e2ded5", up: "#0f7a5c", down: "#c03a2b" };

let fonts: Promise<{ name: string; data: Buffer; weight: 400 | 500; style: "normal" }[]> | null = null;
function loadFonts() {
  const dir = join(process.cwd(), "src/assets/og");
  fonts ??= Promise.all([
    readFile(join(dir, "InstrumentSerif-Regular.ttf")).then((data) => ({ name: "Serif", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(dir, "Geist-Regular.ttf")).then((data) => ({ name: "Geist", data, weight: 400 as const, style: "normal" as const })),
    readFile(join(dir, "Geist-Medium.ttf")).then((data) => ({ name: "Geist", data, weight: 500 as const, style: "normal" as const })),
  ]);
  return fonts;
}

const W = 500;
const H = 300;
/** Room for the end dot inside the drawing. */
const PAD = 10;

/** A flat, slightly restless base that breaks out and climbs: stage 1 into stage 2. */
const MOTIF = (() => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const x = PAD + (i / 60) * (W - 2 * PAD);
    const base = H - 40 + Math.sin(i * 1.3) * 7 + Math.sin(i * 0.47) * 5;
    const t = Math.max(0, (i - 34) / 26);
    pts.push([x, base - t ** 1.6 * (H - 80) + (t > 0 ? Math.sin(i * 1.9) * 6 * t : 0)]);
  }
  return pts;
})();

function scale(closes: number[]): [number, number][] {
  const lo = Math.min(...closes);
  const hi = Math.max(...closes);
  const span = hi - lo || 1;
  return closes.map((c, i) => [PAD + (i / Math.max(1, closes.length - 1)) * (W - 2 * PAD), 16 + (1 - (c - lo) / span) * (H - 32)]);
}

function Line({ pts, color }: { pts: [number, number][]; color: string }) {
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", right: 70, top: 170 }}>
      <defs>
        <linearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.13" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
        {/* The line fades in from the left, so it never crowds the text beside it. */}
        <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor={color} stopOpacity="0" />
          <stop offset="0.22" stopColor={color} stopOpacity="1" />
        </linearGradient>
        <linearGradient id="fadeFill" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.22" stopColor="#fff" stopOpacity="1" />
        </linearGradient>
        <mask id="m">
          <rect width={W} height={H} fill="url(#fadeFill)" />
        </mask>
      </defs>
      <path d={`${d} L${last[0]} ${H} L${pts[0]![0]} ${H} Z`} fill="url(#fill)" mask="url(#m)" />
      <path d={d} fill="none" stroke="url(#fade)" strokeWidth="3.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="7" fill={color} />
    </svg>
  );
}

function Mark() {
  return (
    <svg width="44" height="44" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill={C.ink} />
      <path d="M5 22h9l3.5-5.5h4L27 7" fill="none" stroke="#3fbf8f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export interface OgCard {
  /** Small line above the title. */
  eyebrow: string;
  title: string;
  subtitle: string;
  /** A stock's closes, oldest first; the motif when absent. */
  closes?: number[];
  /** Bottom-left caption (defaults to the data source). */
  caption?: React.ReactNode;
}

export async function ogImage({ eyebrow, title, subtitle, closes, caption }: OgCard): Promise<ImageResponse> {
  const up = !closes || closes.length < 2 || closes[closes.length - 1]! >= closes[0]!;
  const titleSize = title.length <= 9 ? 120 : title.length <= 14 ? 96 : 84;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: C.bg, padding: "64px 80px 56px", fontFamily: "Geist", color: C.ink, position: "relative" }}>
        <Line pts={closes && closes.length > 1 ? scale(closes) : MOTIF} color={up ? C.up : C.down} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Mark />
          <span style={{ fontSize: 28, fontWeight: 500, letterSpacing: -0.4 }}>Stage Two</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", maxWidth: 600 }}>
          <span style={{ fontSize: 24, color: C.ink3, marginBottom: 14 }}>{eyebrow}</span>
          <span style={{ fontFamily: "Serif", fontSize: titleSize, lineHeight: 1, letterSpacing: -1.5 }}>{title}</span>
          <span style={{ fontSize: 28, lineHeight: 1.4, color: C.ink2, marginTop: 24, maxWidth: 560 }}>{subtitle}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.line}`, paddingTop: 24, fontSize: 22, color: C.ink3 }}>
          <span style={{ display: "flex" }}>{caption ?? "NSE end-of-day data, updated every evening"}</span>
          <span>stage-two-pd.vercel.app</span>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await loadFonts() },
  );
}

export { C as OG_COLORS };
