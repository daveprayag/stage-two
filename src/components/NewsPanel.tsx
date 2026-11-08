import { ExternalLink, FileText } from "lucide-react";
import type { Filing, Headline, NewsVerdict } from "@/engine/types";
import { SentimentDot, sentimentLabel } from "./Badges";

export function NewsPanel({ ai, filings, headlines }: { ai: NewsVerdict | null; filings: Filing[]; headlines: Headline[] }) {
  return (
    <section className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-medium">What the news says</h2>
        {ai ? (
          <div className="mt-3 space-y-3 text-sm">
            <p className="flex items-center gap-2 text-xs text-ink-2">
              <SentimentDot s={ai.sentiment} /> {sentimentLabel(ai.sentiment)}
            </p>
            <p className="text-ink">{ai.summary}</p>
            {ai.catalysts.length > 0 && (
              <div>
                <div className="text-xs text-ink-3">Catalysts</div>
                <ul className="mt-1 space-y-1">
                  {ai.catalysts.map((c) => (
                    <li key={c} className="rounded bg-up-soft px-2 py-1 text-xs text-up">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            {ai.redFlags.length > 0 && (
              <div>
                <div className="text-xs text-ink-3">Red flags</div>
                <ul className="mt-1 space-y-1">
                  {ai.redFlags.map((c) => (
                    <li key={c} className="rounded bg-down-soft px-2 py-1 text-xs text-down">{c}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-[11px] text-ink-3">Summarised by Gemini from the filings and headlines on this page only. Check the sources.</p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-ink-2">No AI summary: the nightly news job covers the top 60 stocks on the screener. Filings and headlines are below.</p>
        )}
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-medium">NSE filings · last 3 weeks</h2>
        <ul className="mt-3 space-y-3">
          {filings.slice(0, 8).map((f, k) => (
            <li key={k} className="text-sm">
              <div className="flex items-center justify-between gap-2 text-xs text-ink-3">
                <span>{f.category}</span>
                <span className="num shrink-0">{f.date.slice(0, 11)}</span>
              </div>
              <p className="mt-0.5 line-clamp-3 text-ink-2">{f.text || "—"}</p>
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue hover:underline">
                  <FileText className="h-3 w-3" /> Filing PDF
                </a>
              )}
            </li>
          ))}
          {!filings.length && <li className="text-sm text-ink-3">No filings in the last three weeks.</li>}
        </ul>
      </div>
      <div className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-medium">Headlines · last 2 weeks</h2>
        <ul className="mt-3 space-y-3">
          {headlines.map((h) => (
            <li key={h.url} className="text-sm">
              <a href={h.url} target="_blank" rel="noreferrer" className="group text-ink hover:text-blue">
                {h.title} <ExternalLink className="inline h-3 w-3 opacity-0 group-hover:opacity-100" />
              </a>
              <div className="mt-0.5 text-xs text-ink-3">
                {h.source} · <span className="num">{h.date}</span>
              </div>
            </li>
          ))}
          {!headlines.length && <li className="text-sm text-ink-3">No headlines found.</li>}
        </ul>
      </div>
    </section>
  );
}
