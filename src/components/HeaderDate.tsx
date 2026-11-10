"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

/** IST date and minutes since midnight, without relying on the viewer's time zone. */
function istNow(): { date: string; mins: number; weekday: boolean } {
  const t = new Date(Date.now() + 330 * 60_000);
  const day = t.getUTCDay();
  return { date: t.toISOString().slice(0, 10), mins: t.getUTCHours() * 60 + t.getUTCMinutes(), weekday: day >= 1 && day <= 5 };
}

/** What the next update is, on a weekday whose close isn't in yet. Holidays look like normal days here. */
function nextNote(asOf: string, liveDate: string | null): string | null {
  const n = istNow();
  if (!n.weekday || asOf >= n.date) return null;
  if (n.mins < 9 * 60 + 15) return null;
  // NSE's live data still on an earlier day well after the open: no session today (a trading holiday).
  if (n.mins >= 9 * 60 + 25 && liveDate && liveDate < n.date) return "no trading today";
  if (n.mins < 15 * 60 + 30) return "market open · prices live";
  return "today's close usually arrives 5–7 pm";
}

/** Header badge: which session's closing prices the lists use, and when the next ones are due. */
export function HeaderDate({ asOf, liveDate }: { asOf: string; liveDate: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setNote(nextNote(asOf, liveDate));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [asOf, liveDate]);
  const title = `Lists use NSE closing prices from ${short(asOf)}.${note ? ` ${note[0]!.toUpperCase()}${note.slice(1)}.` : ""} Checked every 15 min from 5:30 pm IST.`;
  return (
    <Link href="/runs" title={title} className="flex flex-col items-end text-right leading-tight">
      <span className="text-xs text-ink-3">
        <span className="font-medium tabular-nums text-ink-2">{short(asOf)}</span> close
      </span>
      {note && <span className="hidden text-[11px] text-ink-3 sm:block">{note}</span>}
    </Link>
  );
}
