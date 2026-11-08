import type { Metadata } from "next";
import Link from "next/link";
import { RsBar } from "@/components/Badges";
import { pct } from "@/lib/format";
import { getScreen } from "@/lib/data";

export const metadata: Metadata = { title: "Sectors" };
export const revalidate = 900;

export default async function SectorsPage() {
  const screen = await getScreen();
  const sectors = screen?.sectors ?? [];
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div>
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Sector strength</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-2">
          Leaders tend to come in groups. Sectors ranked by the median RS rating of their liquid stocks, with the share already in a stage 2 uptrend.
          Industry groups follow NSE&apos;s classification; stocks outside the NIFTY Total Market and Microcap 250 lists are unclassified.
        </p>
      </div>
      <section className="scroll-x rounded-xl border border-line bg-surface">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-ink-3">
              <th className="px-4 py-2 font-normal">#</th>
              <th className="px-4 py-2 font-normal">Sector</th>
              <th className="px-4 py-2 font-normal">Median RS</th>
              <th className="px-4 py-2 font-normal">In stage 2</th>
              <th className="px-4 py-2 text-right font-normal">Median 1M</th>
              <th className="px-4 py-2 font-normal">Strongest stocks</th>
            </tr>
          </thead>
          <tbody>
            {sectors.map((s, k) => (
              <tr key={s.industry} className="border-b border-line/70 last:border-0">
                <td className="num px-4 py-3 text-ink-3">{k + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{s.industry}</div>
                  <div className="text-xs text-ink-3">{s.stocks} stocks</div>
                </td>
                <td className="px-4 py-3">
                  <RsBar rs={s.rs} />
                </td>
                <td className="px-4 py-3">
                  <span className="flex items-center gap-2">
                    <span className="num w-9 text-right">{(s.stage2 * 100).toFixed(0)}%</span>
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-up" style={{ width: `${s.stage2 * 100}%` }} />
                    </span>
                  </span>
                </td>
                <td className={`num px-4 py-3 text-right ${s.ret1m >= 0 ? "text-up" : "text-down"}`}>{pct(s.ret1m)}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {s.leaders.map((sym) => (
                      <Link key={sym} href={`/stock/${encodeURIComponent(sym)}`} className="rounded border border-line px-1.5 py-0.5 text-xs text-ink-2 hover:border-line-strong hover:text-ink">
                        {sym}
                      </Link>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
