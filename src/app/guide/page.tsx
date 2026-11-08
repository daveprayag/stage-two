import type { Metadata } from "next";
import { Card, Page, PageTitle } from "@/components/Page";

export const metadata: Metadata = { title: "Guide" };

function StagesDiagram() {
  // Schematic price path through the four stages, with its 30-week average lagging behind.
  return (
    <svg viewBox="0 0 640 220" className="h-auto w-full" role="img" aria-label="Price moving through stage 1 base, stage 2 advance, stage 3 top and stage 4 decline, with a lagging moving average">
      <g stroke="var(--line)" strokeWidth="1">
        <line x1="160" y1="10" x2="160" y2="200" strokeDasharray="3 4" />
        <line x1="330" y1="10" x2="330" y2="200" strokeDasharray="3 4" />
        <line x1="470" y1="10" x2="470" y2="200" strokeDasharray="3 4" />
      </g>
      <path d="M10 160 L40 150 L60 165 L90 152 L115 166 L140 150 L160 155 L185 130 L205 138 L230 100 L250 110 L275 72 L295 80 L320 48 L345 62 L370 40 L395 66 L420 45 L445 70 L470 60 L495 95 L515 88 L545 125 L565 118 L595 158 L630 170" fill="none" stroke="var(--ink)" strokeWidth="2" strokeLinejoin="round" />
      <path d="M10 165 C80 162 140 160 175 152 C230 138 280 105 330 80 C380 60 430 60 470 72 C520 90 570 125 630 150" fill="none" stroke="var(--chart-ma200)" strokeWidth="2.5" />
      <g fontSize="13" fill="var(--ink-2)" fontFamily="var(--font-geist), sans-serif">
        <text x="40" y="200">1 · Base</text>
        <text x="200" y="200">2 · Advance</text>
        <text x="365" y="200">3 · Top</text>
        <text x="515" y="200">4 · Decline</text>
      </g>
      <text x="620" y="140" fontSize="11" textAnchor="end" fill="var(--chart-ma200)" fontFamily="var(--font-geist), sans-serif">30-week average</text>
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-6">
      <h2 className="font-display text-[1.75rem] leading-tight tracking-tight sm:text-3xl">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink-2 [&_li]:pl-1 [&_ul]:space-y-2">{children}</div>
    </section>
  );
}

export default function GuidePage() {
  return (
    <Page narrow>
      <PageTitle title="How to read the screener">
        Moving averages, stages, support and resistance, volume: what swing traders use them for, how this app computes them, and how much weight they can carry.
      </PageTitle>

      <Section title="The 50- and 200-day moving averages">
        <p>
          A moving average is the average closing price of the last N sessions, drawn as a line. The 50-day follows the intermediate trend; the 200-day (about
          40 weeks) follows the long trend. On a weekly chart the same lines are the 10- and 40-week averages.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-ink">Trend filter.</strong> Momentum traders only buy stocks above both lines, with the 200-day rising. Mark Minervini&apos;s trend template (the 8-point checklist on each stock page) is the strict version.</li>
          <li><strong className="text-ink">Support in uptrends.</strong> In a healthy advance, pullbacks often stall near the 50-day. A close well below it is the first sign the trend is weakening.</li>
          <li><strong className="text-ink">Resistance in downtrends.</strong> When a falling stock or index rallies up to its 50- or 200-day and turns down there, traders say the average &quot;acted as resistance&quot;: sellers who bought higher use the bounce to get out.</li>
          <li><strong className="text-ink">Crosses.</strong> The 50-day crossing above the 200-day is a &quot;golden cross&quot;, below it a &quot;death cross&quot;. Both are slow and mostly used to judge the overall market.</li>
        </ul>
      </Section>

      <Section title="Stages">
        <p>
          Stan Weinstein split a stock&apos;s life into four stages using the 30-week (≈150-day) average. Swing traders only want stage 2. This app calls a stock
          stage 2 when it closes above a 150-day average that rose more than 1% over the last 20 sessions; stage 4 is the mirror image; a flat average is
          stage 3 after an advance and stage 1 otherwise. &quot;Fresh stage 2&quot; finds stocks that crossed into stage 2 within the last 30 sessions: the
          earliest point at which a new leader shows up.
        </p>
        <Card className="p-4">
          <StagesDiagram />
        </Card>
      </Section>

      <Section title="Support, resistance and trendlines">
        <p>
          These are drawn by hand on most charts, and there is no single formula. The usual method, which this app follows:
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li><strong className="text-ink">Horizontal levels.</strong> Mark the swing highs and lows (a bar higher or lower than the five bars either side). Where several turn at about the same price (within 2.5%), that price is a level; more touches mean more traders are watching it. Above the price it is resistance, below it support.</li>
          <li><strong className="text-ink">Trendlines.</strong> Join two rising swing lows (support) or two falling swing highs (resistance), and keep the line only if no close has broken through it since. The longest such line is the one that matters.</li>
          <li><strong className="text-ink">Breakouts.</strong> A close above resistance, especially the top of a multi-week base, on volume well above average is the classic entry. Without the volume, many breakouts fall back.</li>
        </ul>
      </Section>

      <Section title="Volume">
        <p>
          Volume shows conviction. In a good base, volume dries up as the range tightens (the &quot;Vol 5/50&quot; column below 1, a narrow 10-day range): sellers
          are exhausted. On the breakout day volume should jump to at least 1.5× its 50-day average. Ankur Patel&apos;s volume scan looks for days up 6.5%+ on
          3× average volume.
        </p>
      </Section>

      <Section title="Relative strength">
        <p>
          The RS rating (1–99) ranks every liquid NSE stock on its 3-, 6-, 9- and 12-month performance, weighting the latest quarter double. 90+ means the stock
          has outperformed 90% of the market. The &quot;RS line&quot; is the stock divided by the NIFTY 500; when it makes a new high before the price does,
          the stock is leading.
        </p>
      </Section>

      <Section title="What the screens are, and are not">
        <p>
          Every screen here is a shortlist for your own review, not a buy signal. Tested mechanically on 2021–2024 NSE data with real delivery costs, rules like
          these (Ankur Patel&apos;s setups, trend filters, breakouts with stops) came out roughly breakeven before costs and below a NIFTY 500 index fund after
          them. Their value is in narrowing 2,000 stocks to a few dozen worth a look, and the news column is there so a chart pattern is checked against a reason
          for the move.
        </p>
        <p>
          Data: NSE&apos;s daily bhavcopy, index closes, price bands, corporate actions and filings, adjusted for splits and bonuses. Headlines come from Google
          News; summaries are written by Gemini from those headlines and filings only.
        </p>
      </Section>
    </Page>
  );
}
