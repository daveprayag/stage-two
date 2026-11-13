import { Suspense } from "react";
import { Change } from "@/components/Badges";
import { Card, Page, PageTitle } from "@/components/Page";
import { Bone } from "@/components/Skeleton";
import { SHOWN_TRACK, TRACK_LISTS } from "@/engine/track";
import { getTrack } from "@/lib/data";
import { day } from "@/lib/format";


const pct = (x: number | null) => (x === null ? "—" : `${Math.round(x * 100)}%`);

async function TrackData() {
  const data = await getTrack();
  const perf = data?.first ? data : null;
  return (
    <>
      {perf?.first && <p className="-mt-2 text-xs text-ink-3">Record started on {day(perf.first)}.</p>}
      {!perf ? (
        <p className="text-sm text-ink-3">No picks recorded yet. The first nightly run after launch will start the record.</p>
      ) : (
        <>
          <Card>
            <ul className="divide-y divide-line md:hidden">
              {perf.lists.filter((l) => SHOWN_TRACK.has(l.key)).map((l) => (
                <li key={l.key} className="px-4 py-3.5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] text-ink">{l.label}</span>
                    <Change value={l.avgReturn} className="text-[15px]" />
                  </div>
                  <div className="mt-1 text-xs text-ink-3">
                    {l.days === 0 ? (
                      "No results yet: picks are measured from the next session on."
                    ) : (
                      <>
                        {l.picks} picks over {l.days} {l.days === 1 ? "day" : "days"} · NIFTY 500 <Change value={l.niftyReturn} /> · beat it {pct(l.beatShare)} of
                        days · {pct(l.upShare)} of picks up
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-line text-left">
                  <tr className="text-xs text-ink-3">
                    <th className="px-3 py-3 pl-5 font-normal">List</th>
                    <th className="px-3 py-3 text-right font-normal">Pick days</th>
                    <th className="px-3 py-3 text-right font-normal">Picks</th>
                    <th className="px-3 py-3 text-right font-normal" title="Average of each day's average return since the pick">Return since pick</th>
                    <th className="px-3 py-3 text-right font-normal">NIFTY 500, same days</th>
                    <th className="px-3 py-3 text-right font-normal">Days beating NIFTY</th>
                    <th className="px-3 py-3 pr-5 text-right font-normal">Picks up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {perf.lists.filter((l) => SHOWN_TRACK.has(l.key)).map((l) => (
                    <tr key={l.key}>
                      <td className="px-3 py-3.5 pl-5 text-ink">{l.label}</td>
                      <td className="num px-3 py-3.5 text-right text-ink-2">{l.days}</td>
                      <td className="num px-3 py-3.5 text-right text-ink-2">{l.picks}</td>
                      <td className="px-3 py-3.5 text-right"><Change value={l.avgReturn} /></td>
                      <td className="px-3 py-3.5 text-right"><Change value={l.niftyReturn} /></td>
                      <td className="num px-3 py-3.5 text-right text-ink-2">{pct(l.beatShare)}</td>
                      <td className="num px-3 py-3.5 pr-5 text-right text-ink-2">{pct(l.upShare)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <div className="border-b border-line px-4 py-3 text-sm font-medium text-ink sm:px-5">By pick date</div>
            <ul className="divide-y divide-line">
              {perf.days.map((d) => (
                <li key={d.date} className="px-4 py-3.5 sm:px-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">{day(d.date)}</span>
                    <span className="text-xs text-ink-3">
                      {d.sessionsSince === 0 ? (
                        "Saved at this close · first result after the next session's close"
                      ) : (
                        <>
                          {d.sessionsSince} {d.sessionsSince === 1 ? "session" : "sessions"} ago · NIFTY 500 <Change value={d.nifty} />
                        </>
                      )}
                    </span>
                  </div>
                  <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    {TRACK_LISTS.filter((l) => l.shown).map(({ key, label }) => (
                      <div key={key} className="flex items-baseline justify-between gap-2">
                        <dt className="truncate text-ink-3">{label}</dt>
                        <dd className="shrink-0">
                          {(d.lists[key]?.n ?? 0) === 0 ? <span className="text-ink-3">none</span> : (
                            <>
                              <span className="num text-ink-3">{d.lists[key]?.n}{d.sessionsSince === 0 ? " picks" : " · "}</span>
                              {d.sessionsSince > 0 && <Change value={d.lists[key]?.avg ?? null} />}
                            </>
                          )}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </>
  );
}

/** Same rows as the real table, list names shown, numbers as placeholders. */
function TrackSkeleton() {
  const lists = TRACK_LISTS.filter((l) => l.shown);
  return (
    <Card>
      <span className="sr-only" role="status">Loading the latest data…</span>
      <ul className="divide-y divide-line md:hidden" aria-hidden="true">
        {lists.map((l) => (
          <li key={l.key} className="px-4 py-3.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px] text-ink">{l.label}</span>
              <Bone className="h-4 w-14" />
            </div>
            <Bone className="mt-2 h-3 w-56" />
          </li>
        ))}
      </ul>
      <div className="hidden md:block" aria-hidden="true">
        <table className="w-full text-sm">
          <thead className="border-b border-line text-left">
            <tr className="text-xs text-ink-3">
              <th className="px-3 py-3 pl-5 font-normal">List</th>
              <th className="px-3 py-3 text-right font-normal">Pick days</th>
              <th className="px-3 py-3 text-right font-normal">Picks</th>
              <th className="px-3 py-3 text-right font-normal">Return since pick</th>
              <th className="px-3 py-3 text-right font-normal">NIFTY 500, same days</th>
              <th className="px-3 py-3 text-right font-normal">Days beating NIFTY</th>
              <th className="px-3 py-3 pr-5 text-right font-normal">Picks up</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lists.map((l) => (
              <tr key={l.key}>
                <td className="px-3 py-3.5 pl-5 text-ink">{l.label}</td>
                {[0, 1, 2, 3, 4, 5].map((k) => (
                  <td key={k} className="px-3 py-3.5 last:pr-5">
                    <Bone className="ml-auto h-4 w-12" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/** The page; `loading` renders the same page with placeholders (the route's loading.tsx). */
export function TrackPage({ loading = false }: { loading?: boolean }) {
  return (
    <Page>
      <PageTitle title="Track record">
        <p>
          Every evening each list&apos;s picks are saved with that day&apos;s close. This page shows how they have done since, next to the NIFTY 500 over the
          same days: an honest, forward-only record. Nothing is back-filled.
        </p>
        <p className="mt-2">
          Give it months before reading anything into it: a few weeks of results mostly reflect what the market did. The research behind Momentum leaders
          measured 6-month outcomes.
        </p>
        <p className="mt-2">
          Days are kept as recorded: picks up to 9 Nov 2026 were made with simple moving averages, later ones with EMAs.
        </p>
      </PageTitle>
      {loading ? <TrackSkeleton /> : <Suspense fallback={<TrackSkeleton />}><TrackData /></Suspense>}
    </Page>
  );
}
