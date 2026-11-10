import { Page } from "./Page";

/** A grey placeholder block, shown while the latest data loads (never an older copy of the data). */
export function Bone({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-surface-2 ${className}`} aria-hidden="true" />;
}

function Title() {
  return (
    <div className="flex flex-col gap-3">
      <Bone className="h-10 w-64 sm:h-12" />
      <Bone className="h-4 w-80 max-w-full" />
    </div>
  );
}

function TableRows({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-4 py-3 md:px-5">
        <Bone className="h-3 w-24" />
      </div>
      <ul className="divide-y divide-line">
        {Array.from({ length: rows }, (_, i) => (
          <li key={i} className="flex items-center gap-4 px-4 py-4 md:px-5">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Bone className="h-4 w-28" />
              <Bone className="h-3 w-40" />
            </div>
            <Bone className="hidden h-4 w-20 md:block" />
            <Bone className="hidden h-4 w-24 md:block" />
            <Bone className="h-4 w-16" />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScreenerSkeleton() {
  return (
    <Page>
      <span className="sr-only" role="status">Loading the latest data…</span>
      <Title />
      <Bone className="h-24 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-2">
        <Bone className="h-16 rounded-xl" />
        <Bone className="h-16 rounded-xl" />
        <Bone className="h-16 rounded-xl" />
      </div>
      <Bone className="h-10 w-full rounded-lg md:w-[36rem]" />
      <TableRows />
    </Page>
  );
}

export function StockSkeleton() {
  return (
    <Page>
      <span className="sr-only" role="status">Loading the latest data…</span>
      <Bone className="h-4 w-20" />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3">
          <Bone className="h-12 w-48 sm:h-14" />
          <Bone className="h-4 w-64" />
        </div>
        <Bone className="h-10 w-36" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Bone className="h-[26rem] rounded-2xl" />
        <Bone className="h-[26rem] rounded-2xl" />
      </div>
      <Bone className="h-40 rounded-2xl" />
    </Page>
  );
}

export function ListSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <Page>
      <span className="sr-only" role="status">Loading the latest data…</span>
      <Title />
      <TableRows rows={rows} />
    </Page>
  );
}
