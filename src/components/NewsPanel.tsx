import { ArrowUpRight } from "lucide-react";
import type { Filing, Headline, NewsVerdict } from "@/engine/types";
import { SentimentDot, sentimentLabel } from "./Badges";
import { Card, CardHeader } from "./Page";

function Points({ title, items, tone }: { title: string; items: string[]; tone: "up" | "down" }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-xs text-ink-3">{title}</div>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((c) => (
          <li key={c} className="flex gap-2 text-sm text-ink">
            <span className={`mt-[7px] h-1 w-1 shrink-0 rounded-full ${tone === "up" ? "bg-up" : "bg-down"}`} />
            {c}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AiSummary({ ai }: { ai: NewsVerdict | null }) {
  if (!ai) return null;
  return (
    <Card>
      <CardHeader
        title="What the news says"
        aside={ai && (
          <span className="flex items-center gap-1.5 text-xs text-ink-2">
            <SentimentDot s={ai.sentiment} /> {sentimentLabel(ai.sentiment)}
          </span>
        )}
      />
      <div className="space-y-4 px-4 pt-3 pb-4 sm:px-5 sm:pb-5">
        {ai ? (
          <>
            <p className="text-[15px] leading-relaxed text-ink">{ai.summary}</p>
            <Points title="Catalysts" items={ai.catalysts} tone="up" />
            <Points title="Red flags" items={ai.redFlags} tone="down" />
            <p className="text-xs text-ink-3">Summarised by Gemini from the filings and headlines below. Check the sources.</p>
          </>
        ) : (
          <p className="text-sm leading-relaxed text-ink-2">The nightly news job summarises the top 60 stocks on the screener. This one isn&apos;t among them today; its filings and headlines are below.</p>
        )}
      </div>
    </Card>
  );
}

export function Sources({ filings, headlines }: { filings: Filing[]; headlines: Headline[] }) {
  return (
    <>
      <Card>
        <CardHeader title="NSE filings" aside={<span className="text-xs text-ink-3">Last 3 weeks</span>} />
        <ul className="mt-2 divide-y divide-line">
          {filings.slice(0, 8).map((f, k) => (
            <li key={k} className="px-4 py-3 sm:px-5">
              <div className="flex items-baseline justify-between gap-3 text-xs text-ink-3">
                <span className="truncate">{f.category}</span>
                <span className="num shrink-0">{f.date.slice(0, 11)}</span>
              </div>
              <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-ink-2">{f.text || "—"}</p>
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-0.5 text-xs text-blue hover:underline">
                  Filing PDF <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
            </li>
          ))}
          {!filings.length && <li className="px-4 py-6 text-sm text-ink-3 sm:px-5">No filings in the last three weeks.</li>}
        </ul>
      </Card>
      <Card>
        <CardHeader title="Headlines" aside={<span className="text-xs text-ink-3">Last 2 weeks</span>} />
        <ul className="mt-2 divide-y divide-line">
          {headlines.map((h) => (
            <li key={h.url}>
              <a href={h.url} target="_blank" rel="noreferrer" className="block px-4 py-3 hover:bg-surface-2/60 sm:px-5">
                <span className="text-sm leading-relaxed text-ink">{h.title}</span>
                <span className="mt-1 block text-xs text-ink-3">
                  {h.source} · <span className="num">{h.date}</span>
                </span>
              </a>
            </li>
          ))}
          {!headlines.length && <li className="px-4 py-6 text-sm text-ink-3 sm:px-5">No headlines found.</li>}
        </ul>
      </Card>
    </>
  );
}
