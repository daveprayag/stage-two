import { cn } from "@/lib/utils";

/** Shared page shell: one max width, one gutter, one vertical rhythm. */
export function Page({ children, narrow = false }: { children: React.ReactNode; narrow?: boolean }) {
  return <div className={`mx-auto flex flex-col gap-6 px-4 pt-6 pb-10 sm:px-6 sm:pt-8 lg:px-8 ${narrow ? "max-w-3xl" : "max-w-7xl"}`}>{children}</div>;
}

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-display text-[2.5rem] leading-[1.05] tracking-tight sm:text-5xl">{title}</h1>
      {children && <div className="max-w-2xl text-sm leading-relaxed text-ink-2">{children}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("overflow-hidden rounded-2xl border border-line bg-surface", className)}>{children}</section>;
}

export function CardHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <h2 className="text-sm font-medium text-ink">{title}</h2>
      {aside}
    </div>
  );
}
