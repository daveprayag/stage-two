"use client";
import { useHeld } from "./holdings";

/** "Held" next to a stock you own (from your last Paytm Money read). Shown only on a device with the passcode. */
export function HeldTag({ symbol }: { symbol: string }) {
  if (!useHeld(symbol)) return null;
  return (
    <span title="In your demat holdings" className="shrink-0 rounded-full border border-ink-3/50 bg-surface-2 px-1.5 py-px text-[10px] leading-4 text-ink-2">
      Held
    </span>
  );
}
