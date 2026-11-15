"use client";
import { Check, ChevronDown, X } from "lucide-react";
import type { Check as CheckItem } from "@/engine/topsetup";

function CheckIcon({ pass }: { pass: boolean }) {
  return pass ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-up" aria-label="Pass" /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-down" aria-label="Fail" />;
}

function TemplateList({ items }: { items: { label: string; pass: boolean; value: string }[] }) {
  return (
    <ul className="mt-2 space-y-2">
      {items.map((c) => (
        <li key={c.label} className="flex gap-2.5">
          <CheckIcon pass={c.pass} />
          <div className="min-w-0">
            <div className="text-[13px] text-ink-2">{c.label}</div>
            <div className="num text-[11px] text-ink-3">{c.value}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Rows({ items, template }: { items: CheckItem[]; template: { label: string; pass: boolean; value: string }[] }) {
  return (
    <ul className="divide-y divide-line">
      {items.map((c) => (
        <li key={c.key} className="px-4 py-2.5 sm:px-5">
          <div className="flex gap-3">
            <CheckIcon pass={c.pass} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-ink">{c.label}</div>
              <div className="num mt-0.5 text-xs leading-relaxed text-ink-3">{c.value}</div>
            </div>
          </div>
          {c.key === "template" && (
            <details className="group mt-2 ml-7">
              <summary className="flex cursor-pointer list-none items-center gap-1 text-xs text-ink-2 hover:text-ink [&::-webkit-details-marker]:hidden">
                Show the 8 points
                <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <TemplateList items={template} />
            </details>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Right-hand checklist card: the Guide's checks, for reference. No star: in the 2011–26 replay, Momentum leaders passing
 * more of them did no better than the rest (livermore EXPERIMENTS "STAGE TWO REPLAY", T2).
 */
export function Checklists(props: {
  star: CheckItem[];
  market: CheckItem | null;
  template: { label: string; pass: boolean; value: string }[];
}) {
  const starPassed = props.star.filter((c) => c.pass).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <span className="text-sm text-ink">Checks</span>
        <span className="num text-xs text-ink-3">
          {starPassed}/{props.star.length}
        </span>
      </div>
      <p className="px-4 pt-3 text-xs leading-relaxed text-ink-3 sm:px-5">
        For reference. The first one, being a Momentum leader, is the one that mattered: replayed over 2012–26, leaders passing more of the others did no
        better than the rest. A red flag in the news check is still a reason to skip.
      </p>
      <div className="mt-1">
        <Rows items={props.star} template={props.template} />
      </div>
      {props.market && (
        <div className="flex gap-3 border-t border-line bg-surface-2/50 px-4 py-2.5 sm:px-5">
          <CheckIcon pass={props.market.pass} />
          <div className="min-w-0">
            <div className="text-sm text-ink">{props.market.label}</div>
            <div className="mt-0.5 text-xs text-ink-3">{props.market.value} · not counted: the same for every stock</div>
          </div>
        </div>
      )}
    </section>
  );
}
