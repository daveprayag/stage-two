import { OG_COLORS, OG_SIZE, ogImage } from "@/lib/og";
import { getStock } from "@/lib/data";
import { day, titleCase } from "@/lib/format";

export const alt = "Stage Two stock page";
export const size = OG_SIZE;
export const contentType = "image/png";

type Params = { symbol: string };

/** Symbol, name and industry, with the stock's last year of closes as the line (no live price: previews get cached). */
export default async function Image({ params }: { params: Promise<Params> | Params }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  const data = await getStock(symbol).catch(() => null);
  if (!data) return ogImage({ eyebrow: "NSE stock", title: symbol, subtitle: "Trend, relative strength, base and the news behind the move." });
  const d = data.detail;
  const year = d.bars.slice(-250);
  const first = year[0]!.close;
  const last = year[year.length - 1]!.close;
  // Every third close (and the last): the shape of the year without the day-to-day noise.
  const closes = year.filter((_, i) => i % 3 === 0 || i === year.length - 1).map((b) => b.close);
  const chg = (last / first - 1) * 100;
  return ogImage({
    eyebrow: d.industry ?? "NSE stock",
    title: symbol,
    subtitle: titleCase(d.name),
    closes,
    caption: (
      <span style={{ display: "flex", gap: 10 }}>
        <span>1 year to {day(year[year.length - 1]!.time)}</span>
        <span style={{ color: chg >= 0 ? OG_COLORS.up : OG_COLORS.down }}>
          {chg >= 0 ? "+" : "−"}
          {Math.abs(chg).toFixed(0)}%
        </span>
      </span>
    ),
  });
}
