import type { LotView } from "@/engine/holdings";
import { day, price } from "@/lib/format";

/** Each buy against the tested plan: stop (set once), hold until; and when the plan says to sell. */
export function PlanLines({ lots, etf }: { lots: LotView[]; etf: boolean }) {
  if (etf || !lots.length) return null;
  const old = lots.filter((l) => !l.date);
  const dated = lots.filter((l) => l.date);
  return (
    <ul className="flex flex-col gap-1 text-xs leading-relaxed">
      {dated.map((l, i) => (
        <li key={`${l.date}-${i}`} className="text-ink-3">
          <span className="text-ink-2">
            Bought {day(l.date as string)}
            {dated.length > 1 || old.length ? ` (${l.qty} shares)` : ""} at ₹{price(l.price)}
          </span>
          {l.stop !== null ? (
            <>
              {" · "}stop {l.stopExact ? "" : "≈ "}₹{price(l.stop)}
              {l.toStop !== null && !l.belowStop && ` (${l.toStop.toFixed(1)}% below)`}
            </>
          ) : (
            " · no stop: not in the screener's lists that day"
          )}
          {" · "}hold until {day(l.holdUntil as string)}
          {l.belowStop && <span className="ml-1.5 text-down">Below the stop: the plan says sell.</span>}
          {l.due && !l.belowStop && <span className="ml-1.5 text-amber">Six months are up: the plan says sell.</span>}
        </li>
      ))}
      {old.length > 0 && (
        <li className="text-ink-3">
          {dated.length ? `${old.reduce((a, l) => a + l.qty, 0)} shares bought` : "Bought"} before tracking began: no plan dates.
        </li>
      )}
    </ul>
  );
}
