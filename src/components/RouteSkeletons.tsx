/** Loading screens shaped like their pages, so nothing jumps when the content arrives. */
import { Page, PageTitle } from "./Page";
import { Bone } from "./Skeleton";

function Lines({ widths }: { widths: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      {widths.map((w, i) => (
        <Bone key={i} className="h-3.5" style={{ width: w }} />
      ))}
    </div>
  );
}

/** The guide: title, then sections of a serif heading and paragraphs (one with the stages diagram, some with lists). */
export function GuideSkeleton() {
  const section = (k: number, extra?: React.ReactNode) => (
    <section key={k} className="flex flex-col gap-4 border-t border-line pt-6">
      <Bone className="h-8 w-64 max-w-full" />
      <Lines widths={["100%", "97%", "99%", "92%", "60%"]} />
      {extra}
    </section>
  );
  return (
    <Page narrow>
      <div className="flex flex-col gap-3" aria-hidden="true">
        <Bone className="h-12 w-80 max-w-full" />
        <Lines widths={["95%", "70%"]} />
      </div>
      {section(0, <Lines widths={["88%", "94%", "84%", "90%"]} />)}
      {section(1, <Bone className="aspect-[640/220] w-full rounded-xl" />)}
      {section(2)}
      {section(3, <Lines widths={["86%", "92%", "78%"]} />)}
      <span className="sr-only" role="status">
        Loading the guide…
      </span>
    </Page>
  );
}

/** The watchlist: title, the add box, three summary cards and the list. */
export function WatchlistSkeleton() {
  return (
    <Page>
      <PageTitle title="Watchlist">
        <p>Stocks you follow, each measured from the day you added it.</p>
      </PageTitle>
      <div className="flex flex-col gap-5" aria-hidden="true">
        <div className="flex flex-col gap-2">
          <div className="flex gap-2 sm:w-96">
            <Bone className="h-10 flex-1 rounded-lg md:h-9" />
            <Bone className="h-10 w-16 rounded-lg md:h-9" />
          </div>
          <Bone className="h-3 w-56" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
              <div className="flex justify-between">
                <Bone className="h-4 w-28" />
                <Bone className="h-3 w-12" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2, 3, 4, 5].map((j) => (
                  <div key={j} className="flex flex-col gap-1.5">
                    <Bone className="h-3 w-14" />
                    <Bone className="h-4 w-10" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-line bg-surface">
          <div className="border-b border-line px-4 py-3 md:px-5">
            <Bone className="h-3 w-48" />
          </div>
          <ul className="divide-y divide-line">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i} className="flex items-center justify-between gap-4 px-4 py-4 md:px-5">
                <div className="flex flex-col gap-1.5">
                  <Bone className="h-4 w-28" />
                  <Bone className="h-3 w-40" />
                </div>
                <Bone className="h-4 w-32" />
              </li>
            ))}
          </ul>
        </div>
      </div>
      <span className="sr-only" role="status">
        Loading your watchlist…
      </span>
    </Page>
  );
}
